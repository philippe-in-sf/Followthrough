export function scrollRecordIntoView(elementId: string) {
  window.setTimeout(() => {
    document.getElementById(elementId)?.scrollIntoView?.({ block: "center" });
  }, 0);
}
