# Things to audit more
1. research mode in chat doese not quite work
   - it does not return a correctly rendered markdown
   - it should create a todo and put reearched result in notes 


# Bugs
## Golden flow is broken
1. hero flow does not work
   - screenshot capture. not asking me for input. 
   - weird floating button on bottom of screen. 
   - in general adding todo should show a row first then sparking to indicate it's getting adding
     enahcned 
     
### create a todo manual things to fix




1. the whole parent note link to child task view is a little weird in following ways
   - no way back to parent after i go to child
   - does child subtask detail view just inehirt the metada of parent? 
   in general this is a bit weird, do you think there is a better UX?

2. the detail card feedback
   - preview/write should show together.
   - seems we do not support full markdown for example #### is not rendered
   - for write tab, i like the style where we had it will still render a bit keeping the markdown so for
   example #### twerew in place it will make it larger but still keep the # 
   - the detail tab should be re-sizable so i can edit note more esaily

# now starting from the top when creating the todo 
  0. the top quick action bar is not great for larger input. also how do i even do muti-line properly
  1. the creating meeting flow is not working properly. i tried with prompt `send a meeting invite to hansen for 9am to follow up on claudia.` 
      - it pick due date to be 6/28 but it booked a meeting Monday. that's wrong
      - it has no title and just send the invite.
      - it did not comfirm hansen as a contact
    i feel like the flow is not complete, like should we ensure there are required fields filled in before we send out invite？
   
  2. when realize it's a meeting action type. it shows a button at the top quick  action bar. that's weird
  3. once the invite is sent it shows ✓Invite sent send a meeting invite to hansen for 9am to follow up on claudia. BUt it does not show the details of the meeting here. we should. other wise that's not sueful





3. this looks weird Update(lib/__tests__/agent-tools.test.ts)
Added 8 lines, removed 5 lines
beforeEach(() => vi.clearAllMocks());

describe("registry gating", () => {
  it("reads are auto (gated=false), writes are gated (gated=true)", () => {
  it("reads + create are auto (gated=false); mutates are gated (gated=true)", () => {
    expect(agentTools.list_todos.gated).toBe(false);
    expect(agentTools.query_todos.gated).toBe(false);
    expect(agentTools.search_contacts.gated).toBe(false);
    expect(agentTools.create_todo.gated).toBe(true);
    // creating a todo is capture, not a side effect → ungated; the do-it tap gates the action.
    expect(agentTools.create_todo.gated).toBe(false);
    expect(agentTools.complete_todo.gated).toBe(true);
    expect(agentTools.uncomplete_todo.gated).toBe(true);
    expect(agentTools.update_todo.gated).toBe(true);
    expect(agentTools.set_reminder.gated).toBe(true);
    expect(agentTools.send_meeting_invite.gated).toBe(true);
    expect(agentTools.deep_research.gated).toBe(true);
  });
  it("no longer exposes direct side-effect tools (actions flow through todos)", () => {
    expect(agentTools.send_meeting_invite).toBeUndefined();
    expect(agentTools.set_reminder).toBeUndefined();
    expect(agentTools.deep_research).toBeUndefined();
  });
});