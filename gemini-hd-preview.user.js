// ==UserScript==
// @name         Gemini HD Preview
// @name:zh-CN   Gemini 高清图片预览
// @namespace    https://github.com/Chen017/gemini-hd-preview
// @version      1.3.1
// @description  Preview original high-resolution Gemini images in chat without saving downloaded files.
// @description:zh-CN 一键在 Gemini 聊天中预览原生 2K 图片，不保存本地文件。
// @author       Chen017
// @match        https://gemini.google.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/Chen017/gemini-hd-preview
// @supportURL   https://github.com/Chen017/gemini-hd-preview/issues
// @downloadURL  https://raw.githubusercontent.com/Chen017/gemini-hd-preview/main/gemini-hd-preview.user.js
// @updateURL    https://raw.githubusercontent.com/Chen017/gemini-hd-preview/main/gemini-hd-preview.user.js
// ==/UserScript==

(() => {
  "use strict";
  if (window.__geminiHDPreview) return;
  window.__geminiHDPreview = true;

  const CONFIG = { buttonInset: 22, min2KPixels: 3000000, timeout: 90000, debug: false };
  const SELECTOR = "generated-image img, .generated-image-container img";
  const controls = new WeakMap();
  const fallbackAttempts = new WeakMap();
  const upgraded = new WeakMap();
  const ownedURLs = new Set();
  let pending = null;
  const log = (...args) => { if (CONFIG.debug) console.info("[Gemini HD]", ...args); };

  function isGoogleImage(src) {
    try {
      const u = new URL(src);
      return u.protocol === "https:" && (u.hostname === "googleusercontent.com" || u.hostname.endsWith(".googleusercontent.com"));
    } catch { return false; }
  }
  function ratio(img) { return img.naturalWidth / Math.max(img.naturalHeight, 1); }
  function setStatus(button, label, state = "") {
    button.textContent = label;
    button.dataset.state = state;
  }
  function resetIfReused(img) {
    const old = upgraded.get(img);
    if (!old || img.getAttribute("src") === old) return;
    img.removeAttribute("data-gemini-hd");
    upgraded.delete(img);
    // Do not revoke immediately: an in-flight image load may still depend on this URL.
    const button = controls.get(img);
    if (button) setStatus(button, "HD");
  }
  function finish(task, label, state = "") {
    if (pending !== task) return;
    clearTimeout(task.timer);
    pending = null;
    setStatus(task.button, label, state);
  }
  function fallbackUrl(src) {
    if (!isGoogleImage(src)) return null;
    const u = new URL(src);
    const suffix = /=(?:s\d+|w\d+-h\d+|w\d+|h\d+)(?:-[a-z0-9]+)*$/i;
    if (!suffix.test(u.pathname)) return null;
    u.pathname = u.pathname.replace(suffix, "=s0-rp");
    return u.href;
  }
  function tryFallback(img) {
    if (img.dataset.geminiHD === "2k" || pending?.img === img) return;
    const src = img.getAttribute("src") || "";
    if (fallbackAttempts.get(img) === src) return;
    const url = fallbackUrl(src);
    if (!url || url === src) return;
    fallbackAttempts.set(img, src);
    const probe = new Image();
    probe.onload = () => {
      if (!img.isConnected || img.dataset.geminiHD === "2k" || pending?.img === img || img.getAttribute("src") !== src) return;
      if (probe.naturalWidth * probe.naturalHeight >= img.naturalWidth * img.naturalHeight &&
          Math.abs(probe.naturalWidth / probe.naturalHeight - ratio(img)) < 0.03) {
        img.removeAttribute("srcset");
        img.src = url;
      }
    };
    probe.src = url;
  }
  function findNativeDownload(img) {
    const single = img.closest("single-image");
    const group = img.closest("generated-image, .generated-image-container");
    const scopes = [single, group, group?.parentElement].filter(Boolean);
    const multiple = group && group.querySelectorAll("single-image").length > 1;
    const candidates = new Map();
    for (const scope of scopes) {
      for (const button of scope.querySelectorAll('button, [role="button"]')) {
        if (button.classList.contains("g2k-button") || button.disabled || button.getAttribute("aria-disabled") === "true") continue;
        const owner = button.closest("single-image");
        if (owner && owner !== single) continue;
        if (multiple && !owner) continue;
        const label = [
          button.getAttribute("aria-label"), button.getAttribute("title"),
          button.getAttribute("mattooltip"), button.getAttribute("data-tooltip"),
          button.getAttribute("data-test-id"), button.innerText,
          button.querySelector("mat-icon")?.textContent
        ].filter(Boolean).join(" ").toLowerCase();
        let score = /下载完整尺寸|下载原图|下载高清|download.*full.?size|download.*original/i.test(label) ? 100 :
          /download|下载图片|file_download/i.test(label) ? 60 : 0;
        if (!score) continue;
        if (single && owner === single) score += 20;
        candidates.set(button, Math.max(score, candidates.get(button) || 0));
      }
    }
    const ranked = [...candidates].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return null;
    return ranked[0][0];
  }
  function installFetchHook() {
    const original = window.fetch;
    window.fetch = function (...args) {
      return Reflect.apply(original, this, args).then(async response => {
        const task = pending;
        if (!task || !response.ok || !isGoogleImage(response.url)) return response;
        if (!/^\/rd-gg(?:-dl)?\//i.test(new URL(response.url).pathname)) return response;
        if (!/^image\//i.test(response.headers.get("content-type") || "")) return response;

        let blob, width, height;
        try {
          blob = await response.clone().blob();
          const bitmap = await createImageBitmap(blob);
          width = bitmap.width;
          height = bitmap.height;
          bitmap.close();
        } catch (error) {
          log("Decode failed:", error);
          return response;
        }
        if (width * height < CONFIG.min2KPixels || pending !== task) return response;
        const img = task.img;
        if (!img.isConnected || img.getAttribute("src") !== task.source ||
            img.dataset.geminiHD === "2k" || Math.abs(width / height - task.ratio) > 0.03) return response;

        let objectURL;
        try {
          objectURL = URL.createObjectURL(blob);
          img.removeAttribute("srcset");
          img.removeAttribute("sizes");
          img.src = objectURL;
          img.dataset.geminiHD = "2k";
          upgraded.set(img, objectURL);
          ownedURLs.add(objectURL);
        } catch (error) {
          if (objectURL) URL.revokeObjectURL(objectURL);
          log("Replacement failed:", error);
          return response;
        }
        finish(task, "2K ✓", "success");
        log("2K preview:", width, height);

        // Intentionally reject only the validated response produced by our HD click.
        // Gemini's native download code will not receive the original image response.
        throw new DOMException("HD preview only (no file download)", "AbortError");
      });
    };
  }
  function startHD(img, button) {
    if (img.dataset.geminiHD === "2k" || pending) return;
    const native = findNativeDownload(img);
    if (!native) {
      setStatus(button, "不可用", "error");
      setTimeout(() => { if (button.dataset.state === "error") setStatus(button, "HD"); }, 3000);
      return;
    }
    const source = img.getAttribute("src");
    if (!source || !img.naturalWidth || !img.naturalHeight) return;
    const task = { img, button, source, ratio: ratio(img), timer: null };
    pending = task;
    setStatus(button, "…", "loading");
    task.timer = setTimeout(() => finish(task, "重试", "error"), CONFIG.timeout);
    try { native.click(); }
    catch (error) { log("Native click failed:", error); finish(task, "重试", "error"); }
  }
  function positionButton(img, button) {
    const outer = button.parentElement?.getBoundingClientRect();
    const inner = img.getBoundingClientRect();
    if (!outer || !inner.width || !inner.height) return;
    button.style.left = `${inner.left - outer.left + CONFIG.buttonInset}px`;
    button.style.top = `${inner.top - outer.top + CONFIG.buttonInset}px`;
  }
  function addButton(img) {
    const existing = controls.get(img);
    if (existing?.isConnected) { positionButton(img, existing); return; }
    const owner = img.closest("single-image") || img.closest("generated-image, .generated-image-container");
    if (!owner) return;
    if (getComputedStyle(owner).position === "static") owner.style.position = "relative";
    owner.classList.add("g2k-anchor");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "g2k-button";
    button.textContent = "HD";
    button.title = "Preview full-size image without downloading";
    for (const type of ["pointerdown", "mousedown"]) button.addEventListener(type, event => event.stopPropagation());
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      startHD(img, button);
    });
    owner.appendChild(button);
    controls.set(img, button);
    positionButton(img, button);
  }
  function scan() {
    document.querySelectorAll(SELECTOR).forEach(img => {
      if (!img.naturalWidth) return;
      resetIfReused(img);
      addButton(img);
      tryFallback(img);
    });
  }
  function initialize() {
    const style = document.createElement("style");
    style.textContent = `
      .g2k-button {
        position:absolute!important;z-index:1000!important;
        width:36px!important;height:30px!important;min-width:0!important;
        padding:0!important;margin:0!important;display:flex!important;
        align-items:center!important;justify-content:center!important;
        border:1px solid rgba(255,255,255,.16)!important;border-radius:9px!important;
        background:rgba(25,29,36,.78)!important;color:#fff!important;
        font:600 12px system-ui,sans-serif!important;letter-spacing:.2px!important;
        backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
        box-shadow:0 2px 8px rgba(0,0,0,.16);
        opacity:0!important;visibility:hidden!important;pointer-events:none!important;
        transform:translateY(-3px);
        transition:opacity .15s ease,transform .15s ease,visibility .15s ease,background .15s ease;
        cursor:pointer!important;
      }
      .g2k-anchor:has(img:hover) > .g2k-button,
      .g2k-anchor > .g2k-button:hover,
      .g2k-anchor > .g2k-button:focus-visible {
        opacity:1!important;visibility:visible!important;pointer-events:auto!important;
        transform:translateY(0);
      }
      .g2k-button:hover { background:rgba(35,43,56,.94)!important; }
      .g2k-button[data-state="loading"] { cursor:wait!important; }
      .g2k-button[data-state="success"] { width:52px!important;background:rgba(30,80,65,.90)!important; }
      .g2k-button[data-state="error"] { width:auto!important;min-width:44px!important;padding:0 7px!important;background:rgba(125,45,45,.90)!important; }
    `;
    (document.head || document.documentElement).appendChild(style);
    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 200);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
    window.addEventListener("resize", scan);
    window.addEventListener("load", scan);
    scan();
  }

  installFetchHook();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();

  window.addEventListener("pagehide", () => {
    for (const url of ownedURLs) URL.revokeObjectURL(url);
    ownedURLs.clear();
  });
})();
