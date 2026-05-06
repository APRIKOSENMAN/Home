// Shared mutable state that multiple modules need to read or write
export let currentUser = null;
export function setCurrentUser(val) { currentUser = val; }
