// The four-point "ta-da" glyph (brand mark), shared by the landing page and the
// quick-add enhancing indicator. Inherits color via currentColor.
export function Spark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 0c.6 5.7 3.3 8.4 9 9-5.7.6-8.4 3.3-9 9-.6-5.7-3.3-8.4-9-9 5.7-.6 8.4-3.3 9-9Z"
      />
    </svg>
  );
}
