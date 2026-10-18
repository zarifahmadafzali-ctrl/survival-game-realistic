const errors: string[] = [];
export const getErrors = () => errors.slice(-6);
export const clearErrors = () => {
  errors.length = 0;
};
export function installErrorLog() {
  const push = (m: string) => errors.push(`${new Date().toLocaleTimeString()} ${m.slice(0, 300)}`);
  window.addEventListener("error", (e) => push(e.message + (e.filename ? ` @${e.filename.split("/").pop()}:${e.lineno}` : "")));
  window.addEventListener("unhandledrejection", (e) => push("promise: " + String((e.reason && e.reason.message) || e.reason)));
}
