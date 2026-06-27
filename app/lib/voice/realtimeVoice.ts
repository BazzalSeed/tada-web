// Browser WebRTC client for Tada voice (T3.5) — the gpt-realtime brain.
// Ported + slimmed from Clawdia's realtimeVoice; the Tada-specific part is the
// GATED tool loop: a write tool's call pauses for a visual Approve/Deny in the
// VoiceStage and NEVER auto-executes (the executor runs server-side only on an
// explicit Approve). Framework-free (no React) so the React glue (useVoiceSession)
// and the gating logic stay testable. Browser-only — guard before constructing.
//
// Flow: POST /api/voice/session (mint ephemeral OpenAI secret + embedded tool
// defs) → getUserMedia → RTCPeerConnection + `oai-events` data channel → SDP
// exchange with https://api.openai.com/v1/realtime/calls. On
// response.function_call_arguments.done → POST /api/voice/tool; read tools feed
// their output straight back, gated writes surface onApproval first.

import type { ChatCard } from "@/app/components/chat/cards";
import type { VoiceStatus } from "@/lib/contracts";
import { deriveVoiceStatus, type VoicePhaseFlags } from "./voiceStatus";
import {
  buildToolRequest,
  interpretToolResponse,
  DENIED_OUTPUT,
  type VoiceToolRequest,
  type VoiceToolResponse,
} from "./voiceTools";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const GENERIC_ERROR = "Voice couldn't connect — check your mic permission and try again.";

export interface VoiceTranscript {
  user: string;
  assistant: string;
}

// A gated write awaiting the user's tap. The session holds the Realtime call open
// (no function_call_output sent) until approve() or deny() resolves it — the
// never-auto-execute-by-voice seam, surfaced for the VoiceStage to render.
export interface VoiceApproval {
  name: string;
  args: unknown;
  approve: () => void;
  deny: () => void;
}

export interface RealtimeVoiceCallbacks {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (t: VoiceTranscript) => void;
  // The pending gated write (drives the confirm card), or null when none.
  onApproval: (a: VoiceApproval | null) => void;
  // The executed result card to showcase (read results + post-approval writes).
  onCard?: (card: ChatCard) => void;
  onError: (message: string) => void;
  onClosed?: () => void;
}

interface MintResponse {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
}

export class RealtimeVoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;

  private status: VoiceStatus = "connecting";
  private phase: VoicePhaseFlags["phase"] = "connecting";
  private awaitingResponse = false;
  private toolPending = false;
  private audioPlaying = false;
  private transcript: VoiceTranscript = { user: "", assistant: "" };
  private stopped = false;
  private closed = false;

  constructor(private readonly cb: RealtimeVoiceCallbacks) {}

  async start(): Promise<void> {
    try {
      this.phase = "connecting";
      this.recompute();
      const secret = await this.mint();
      if (this.bailIfStopped()) return;
      await this.openMic();
      if (this.bailIfStopped()) return;
      await this.connect(secret);
      if (this.bailIfStopped()) return;
    } catch (err) {
      console.error("voice_start_failed", err);
      if (!this.stopped) {
        this.phase = "error";
        this.recompute();
        this.cb.onError(GENERIC_ERROR);
      }
      this.teardown();
    }
  }

  private bailIfStopped(): boolean {
    if (this.stopped) {
      this.teardown();
      return true;
    }
    return false;
  }

  stop(): void {
    if (this.stopped) return;
    this.teardown();
    this.phase = "ended";
    this.recompute();
  }

  setMicEnabled(enabled: boolean): void {
    if (enabled && this.phase !== "live") return;
    for (const track of this.micStream?.getAudioTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  // 0..1 amplitude — the REMOTE level while she speaks, the MIC otherwise.
  level(): number {
    const analyser = this.audioPlaying ? this.remoteAnalyser : this.micAnalyser;
    if (!analyser) return 0;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 128);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async mint(): Promise<MintResponse> {
    const res = await fetch("/api/voice/session", { method: "POST", cache: "no-store" });
    if (!res.ok) throw new Error(`mint failed: ${res.status}`);
    return (await res.json()) as MintResponse;
  }

  private async openMic(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new Ctx();
    this.micAnalyser = this.audioCtx.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.audioCtx.createMediaStreamSource(this.micStream).connect(this.micAnalyser);
  }

  private async connect(secret: MintResponse): Promise<void> {
    const pc = new RTCPeerConnection();
    this.pc = pc;

    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (this.audioEl && stream) {
        this.audioEl.srcObject = stream;
        this.attachRemoteAnalyser(stream);
      }
    };

    for (const track of this.micStream?.getAudioTracks() ?? []) {
      pc.addTrack(track, this.micStream!);
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (e) => this.onServerEvent(e.data as string));
    dc.addEventListener("open", () => {
      if (!this.stopped) {
        this.phase = "live";
        this.recompute(); // → listening
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes = await fetch(
      `${REALTIME_CALLS_URL}?model=${encodeURIComponent(secret.model)}`,
      {
        method: "POST",
        body: offer.sdp ?? "",
        headers: { Authorization: `Bearer ${secret.clientSecret}`, "Content-Type": "application/sdp" },
      },
    );
    if (!sdpRes.ok) throw new Error(`sdp exchange failed: ${sdpRes.status}`);
    const answer = await sdpRes.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  }

  private attachRemoteAnalyser(stream: MediaStream): void {
    if (!this.audioCtx) return;
    this.remoteAnalyser = this.audioCtx.createAnalyser();
    this.remoteAnalyser.fftSize = 256;
    this.audioCtx.createMediaStreamSource(stream).connect(this.remoteAnalyser);
  }

  private onServerEvent(raw: string): void {
    let evt: { type?: string; [k: string]: unknown };
    try {
      evt = JSON.parse(raw) as typeof evt;
    } catch {
      return;
    }
    const type = evt.type ?? "";

    if (type === "conversation.item.input_audio_transcription.delta") {
      this.transcript = { ...this.transcript, user: this.transcript.user + String(evt.delta ?? "") };
      this.cb.onTranscript(this.transcript);
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      this.transcript = { ...this.transcript, user: String(evt.transcript ?? this.transcript.user) };
      this.cb.onTranscript(this.transcript);
      return;
    }
    if (type === "response.audio_transcript.delta" || type === "response.output_audio_transcript.delta") {
      this.transcript = { ...this.transcript, assistant: this.transcript.assistant + String(evt.delta ?? "") };
      this.cb.onTranscript(this.transcript);
      return;
    }
    if (type === "input_audio_buffer.speech_started") {
      this.transcript = { user: "", assistant: "" };
      this.cb.onTranscript(this.transcript);
      this.awaitingResponse = false;
      this.toolPending = false;
      this.audioPlaying = false;
      this.recompute(); // → listening
      return;
    }
    if (type === "input_audio_buffer.speech_stopped" || type === "response.created") {
      this.awaitingResponse = true;
      this.recompute(); // → thinking
      return;
    }
    if (type === "output_audio_buffer.started" || type === "response.output_audio.delta" || type === "response.audio.delta") {
      this.audioPlaying = true;
      this.awaitingResponse = false;
      this.recompute(); // → speaking (thinking if a tool is still pending)
      return;
    }
    if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
      this.audioPlaying = false;
      this.recompute();
      return;
    }
    if (type === "response.done") {
      this.awaitingResponse = false;
      this.recompute();
      return;
    }
    if (type === "response.function_call_arguments.done") {
      void this.dispatchTool({
        name: String(evt.name ?? ""),
        arguments: typeof evt.arguments === "string" ? evt.arguments : "",
        call_id: typeof evt.call_id === "string" ? evt.call_id : undefined,
      });
      return;
    }
  }

  // The function-call loop. Read tools feed straight back; a GATED write pauses
  // for the user's Approve/Deny — nothing executes until they tap.
  private async dispatchTool(call: { name: string; arguments: string; call_id?: string }): Promise<void> {
    const req = buildToolRequest(call);
    const callId = call.call_id ?? null;
    this.toolPending = true;
    this.recompute();

    let resp: VoiceToolResponse;
    try {
      resp = await this.postTool(req);
    } catch {
      this.finishTool(callId, JSON.stringify({ status: "error", reason: "tool unavailable" }));
      return;
    }

    const outcome = interpretToolResponse(resp);
    if (outcome.kind === "result") {
      if (outcome.card) this.cb.onCard?.(outcome.card);
      this.finishTool(callId, outcome.output);
      return;
    }

    // Gated write → hold the call open and surface the confirm. NOTHING is sent
    // back to the model until the user decides.
    this.cb.onApproval({
      name: outcome.name,
      args: outcome.args,
      approve: () => void this.resolveApproval(req, callId, true),
      deny: () => this.resolveApproval(req, callId, false),
    });
  }

  // Approve → run the tool server-side (approved:true) and feed the real result.
  // Deny → feed the declined output; nothing executes.
  private async resolveApproval(
    req: { name: string; args: unknown; call_id?: string },
    callId: string | null,
    approved: boolean,
  ): Promise<void> {
    this.cb.onApproval(null);
    if (!approved) {
      this.finishTool(callId, DENIED_OUTPUT);
      return;
    }
    this.toolPending = true;
    this.recompute();
    try {
      const resp = await this.postTool({ ...req, approved: true });
      const outcome = interpretToolResponse(resp);
      const output = outcome.kind === "result" ? outcome.output : DENIED_OUTPUT;
      if (outcome.kind === "result" && outcome.card) this.cb.onCard?.(outcome.card);
      this.finishTool(callId, output);
    } catch {
      this.finishTool(callId, JSON.stringify({ status: "error", reason: "tool unavailable" }));
    }
  }

  private async postTool(body: VoiceToolRequest & { approved?: boolean }): Promise<VoiceToolResponse> {
    const res = await fetch("/api/voice/tool", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`tool http ${res.status}`);
    return (await res.json()) as VoiceToolResponse;
  }

  // Hand a tool result back to the model and ask it to continue speaking.
  private finishTool(callId: string | null, output: string): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output },
    });
    this.send({ type: "response.create" });
    this.toolPending = false;
    this.awaitingResponse = true;
    this.recompute();
  }

  private send(event: Record<string, unknown>): void {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(event));
    }
  }

  private recompute(): void {
    const next = deriveVoiceStatus({
      phase: this.phase,
      awaitingResponse: this.awaitingResponse,
      toolPending: this.toolPending,
      audioPlaying: this.audioPlaying,
    });
    if (next !== this.status) {
      this.status = next;
      this.cb.onStatus(next);
    }
  }

  private teardown(): void {
    this.stopped = true;
    this.cb.onApproval(null);
    if (!this.closed) {
      this.closed = true;
      try {
        this.cb.onClosed?.();
      } catch (err) {
        console.warn("voice_close_failed", err);
      }
    }
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    for (const track of this.micStream?.getTracks() ?? []) track.stop();
    void this.audioCtx?.close().catch(() => undefined);
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.pc = null;
    this.dc = null;
    this.micStream = null;
    this.micAnalyser = null;
    this.remoteAnalyser = null;
    this.audioCtx = null;
  }
}
