/**
 * Host half of the dsh-conversation-width bundle.
 *
 * The preference lives in the browser (localStorage) and is applied by the
 * Client half, so there is nothing to register on the Host side; the bundle
 * still needs this row for its `dsh.client` declaration to be discovered.
 */
export function apply() {}
