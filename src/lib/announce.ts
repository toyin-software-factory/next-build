/**
 * Says a message through the page's one polite status region (#status). A screen reader ignores a
 * live region whose text did not change, so the text is cleared first and set on the next frame.
 * Repeating the same message is therefore announced again.
 */
export function announce(text: string, root: Document = document): void {
  const region = root.getElementById("status");
  if (region === null) return;
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}
