/*
 * Call Captain website widget. Paste one line into any website:
 *
 *   <script src="https://callcaptain.vercel.app/embed.js" async></script>
 *
 * Optional: data-label="Plumbing emergency? Talk to us now", data-color="#039855".
 * Adds a floating button; clicking it opens the call panel (an iframe of /widget) where the
 * visitor talks to the AI dispatcher and approves the PayPal hold. Closing the panel hangs up.
 */
(function () {
  if (window.__callCaptain) return;
  window.__callCaptain = true;

  var script = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var origin = new URL(script.src, location.href).origin;
  var label = (script && script.getAttribute("data-label")) || "Emergency? Talk to us now";
  var color = (script && script.getAttribute("data-color")) || "#039855";

  var style = document.createElement("style");
  style.textContent =
    ".cc-btn{position:fixed;right:20px;bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:10px;padding:14px 20px 14px 16px;border:0;border-radius:999px;background:" + color + ";color:#fff;font:600 15px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px rgba(16,24,40,.25);cursor:pointer}" +
    ".cc-btn:hover{filter:brightness(.95)}.cc-dot{width:10px;height:10px;border-radius:50%;background:#a6f4c5;box-shadow:0 0 0 0 rgba(166,244,197,.7);animation:cc-pulse 1.8s infinite}" +
    "@keyframes cc-pulse{0%{box-shadow:0 0 0 0 rgba(166,244,197,.7)}70%{box-shadow:0 0 0 10px rgba(166,244,197,0)}100%{box-shadow:0 0 0 0 rgba(166,244,197,0)}}" +
    ".cc-panel{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:380px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 40px);border-radius:20px;overflow:hidden;background:#0d1f33;box-shadow:0 24px 60px rgba(16,24,40,.35)}" +
    ".cc-close{position:absolute;top:10px;right:10px;z-index:1;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font:400 20px/32px system-ui;cursor:pointer}" +
    ".cc-panel iframe{width:100%;height:100%;border:0}" +
    "@media (max-width:480px){.cc-panel{right:12px;bottom:12px;height:calc(100vh - 24px)}}";
  document.head.appendChild(style);

  var button = document.createElement("button");
  button.className = "cc-btn";
  button.type = "button";
  button.innerHTML = '<span class="cc-dot"></span><span></span>';
  button.lastChild.textContent = label;
  document.body.appendChild(button);

  var panel = null;
  function close() {
    if (panel) panel.remove(); // removing the iframe ends the call
    panel = null;
    button.style.display = "";
  }
  button.addEventListener("click", function () {
    panel = document.createElement("div");
    panel.className = "cc-panel";
    var x = document.createElement("button");
    x.className = "cc-close";
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.onclick = close;
    var frame = document.createElement("iframe");
    frame.src = origin + "/widget";
    frame.allow = "microphone; payment; clipboard-write";
    frame.title = "Talk to our dispatcher";
    panel.appendChild(x);
    panel.appendChild(frame);
    document.body.appendChild(panel);
    button.style.display = "none";
  });
})();
