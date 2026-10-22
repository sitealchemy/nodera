import { describe, expect, it } from 'vitest';
import { summariseMessages } from './manusApi';

/** Builds a message in the shape task.listMessages returns. */
const message = (type: string, payload: Record<string, unknown>, timestamp: number) => ({
  id: `e${timestamp}`,
  type,
  timestamp,
  ...payload,
});

describe('summariseMessages', () => {
  it('reports a task that is still running', () => {
    const snapshot = summariseMessages([
      message('status_update', { status_update: { agent_status: 'running', brief: 'Szkicuję układ' } }, 2),
      message('user_message', { user_message: { content: 'zrób stronę' } }, 1),
    ]);
    expect(snapshot.phase).toBe('running');
    expect(snapshot.brief).toBe('Szkicuję układ');
    expect(snapshot.structuredResult).toBeNull();
  });

  // Messages arrive newest-first by default, so order must not decide the result.
  it('reads the latest status regardless of array order', () => {
    const events = [
      message('status_update', { status_update: { agent_status: 'running' } }, 1),
      message('status_update', { status_update: { agent_status: 'stopped' } }, 9),
    ];
    expect(summariseMessages(events).phase).toBe('stopped');
    expect(summariseMessages([...events].reverse()).phase).toBe('stopped');
  });

  it('surfaces a structured result after the task stops', () => {
    const snapshot = summariseMessages([
      message('status_update', { status_update: { agent_status: 'stopped' } }, 5),
      message(
        'structured_output_result',
        { structured_output_result: { success: true, value: { schemaVersion: 1 }, error: null } },
        6,
      ),
    ]);
    expect(snapshot.phase).toBe('stopped');
    expect(snapshot.structuredResult).toEqual({
      success: true,
      value: { schemaVersion: 1 },
      error: null,
    });
  });

  it('keeps a failed structured result and its reason', () => {
    const snapshot = summariseMessages([
      message('status_update', { status_update: { agent_status: 'stopped' } }, 5),
      message(
        'structured_output_result',
        { structured_output_result: { success: false, value: {}, error: 'nie udało się' } },
        6,
      ),
    ]);
    expect(snapshot.structuredResult?.success).toBe(false);
    expect(snapshot.structuredResult?.error).toBe('nie udało się');
  });

  it('reports a waiting task with the question that was asked', () => {
    const snapshot = summariseMessages([
      message('assistant_message', { assistant_message: { content: 'Jaki kolor preferujesz?' } }, 4),
      message('status_update', { status_update: { agent_status: 'waiting' } }, 5),
    ]);
    expect(snapshot.phase).toBe('waiting');
    expect(snapshot.question).toBe('Jaki kolor preferujesz?');
  });

  it('does not present chatter as a question when the agent is not waiting', () => {
    const snapshot = summariseMessages([
      message('assistant_message', { assistant_message: { content: 'Pracuję nad układem.' } }, 4),
      message('status_update', { status_update: { agent_status: 'running' } }, 5),
    ]);
    expect(snapshot.question).toBeNull();
  });

  it('reports an error message as a failure', () => {
    const snapshot = summariseMessages([
      message('status_update', { status_update: { agent_status: 'running' } }, 1),
      message('error_message', { error_message: { error_type: 'internal', content: 'coś padło' } }, 2),
    ]);
    expect(snapshot.phase).toBe('error');
    expect(snapshot.errorMessage).toBe('coś padło');
  });

  it('copes with an empty message list', () => {
    const snapshot = summariseMessages([]);
    expect(snapshot.phase).toBe('running');
    expect(snapshot.structuredResult).toBeNull();
    expect(snapshot.errorMessage).toBeNull();
  });

  it('ignores message types it does not know', () => {
    const snapshot = summariseMessages([
      message('tool_used', { tool_used: { tool: 'browser' } }, 1),
      message('plan_update', { plan_update: {} }, 2),
      message('status_update', { status_update: { agent_status: 'stopped' } }, 3),
    ]);
    expect(snapshot.phase).toBe('stopped');
  });
});
