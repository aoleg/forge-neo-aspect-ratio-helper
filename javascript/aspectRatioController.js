(function () {
  console.log("[ARH] aspectRatioController.js loaded");

  const _OFF = "Off";
  const _LOCK = "🔒";
  const _IMAGE = "🖼️";

  const DEFAULT_RATIOS = ["1:1", "3:2", "4:3", "5:4", "16:9", "21:9"];

  const _MAXIMUM_DIMENSION = 2048;
  const _MINIMUM_DIMENSION = 64;

  const _IMAGE_INPUT_CONTAINER_IDS = [
    "img2img_image",
    "img2img_sketch",
    "img2maskimg",
    "inpaint_sketch",
    "img_inpaint_base",
  ];

  const roundToClosestMultiple = (num, multiple) =>
    Math.round(Number(num) / multiple) * multiple;

  const aspectRatioFromStr = (ar) => {
    if (!ar || !ar.includes(":")) return null;
    return ar.split(":").map((x) => Number(x));
  };

  const getSharedOpt = (key, fallback) => {
    const sharedOpts =
      typeof opts !== "undefined" && Object.keys(opts).length ? opts :
      window.opts || globalThis.opts || {};
    return sharedOpts[key] ?? fallback;
  };

  const getConfiguredRatios = () => {
    const configured = getSharedOpt("arh_javascript_aspect_ratio", DEFAULT_RATIOS.join(","));
    const ratios = String(configured)
      .split(",")
      .map((ratio) => ratio.trim())
      .filter((ratio) => {
        const parsed = aspectRatioFromStr(ratio);
        return parsed?.length === 2 && parsed.every((value) => Number.isFinite(value) && value > 0);
      });

    return ratios.length ? ratios : DEFAULT_RATIOS;
  };

  const reverseAspectRatio = (ar) => {
    if (!ar || !ar.includes(":")) return null;
    const [w, h] = ar.split(":");
    return `${h}:${w}`;
  };

  const clampToBoundaries = (
    width, height,
    maxDim = _MAXIMUM_DIMENSION, minDim = _MINIMUM_DIMENSION,
  ) => {
    const ar = width / height;

    width = Math.max(Math.min(width, maxDim), minDim);
    height = Math.max(Math.min(height, maxDim), minDim);

    if (width / height > ar) height = Math.round(width / ar);
    else if (width / height < ar) width = Math.round(height * ar);

    width = Math.max(Math.min(width, maxDim), minDim);
    height = Math.max(Math.min(height, maxDim), minDim);

    return [width, height];
  };

  // Side lengths considered "standard" (SD1.5, SD2, SDXL and its
  // 1.5x / 2x multiples). Used by the lock-mode snapping behavior.
  const _STANDARD_SIDES = [512, 768, 1024, 1536, 2048];
  const _SNAP_RANGE = 64;

  // Compute (width, height) for the ratio arW:arH so that the total area
  // is as close as possible to sideLength² without exceeding it.
  // With align64, only multiples of 64 are produced; candidates come from
  // rounding the ideal dimensions down/up, and the in-budget pair whose
  // ratio is closest (log scale) to the target wins. This reproduces the
  // SDXL presets: 3:2 @ 1024 -> 1216x832, 16:9 @ 1024 -> 1344x768, etc.
  const fitResolution = (
    arW, arH, sideLength, align64,
    maxDim = _MAXIMUM_DIMENSION, minDim = _MINIMUM_DIMENSION,
  ) => {
    const ratio = arW / arH;
    const budget = sideLength * sideLength;
    let idealW = sideLength * Math.sqrt(ratio);
    let idealH = sideLength / Math.sqrt(ratio);

    // The full budget may not be reachable within the dimension bounds
    // (e.g. any non-square ratio at side == maxDim). Rescale the ideal
    // pair to fit the bounds while preserving the ratio, so both
    // dimensions keep tracking the ratio instead of one getting pinned
    // at the cap.
    const longest = Math.max(idealW, idealH);
    const shortest = Math.min(idealW, idealH);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      idealW *= scale;
      idealH *= scale;
    } else if (shortest < minDim) {
      const scale = minDim / shortest;
      idealW *= scale;
      idealH *= scale;
    }

    if (!align64) {
      return clampToBoundaries(Math.round(idealW), Math.round(idealH), maxDim, minDim);
    }

    const clamp64 = (v) =>
      Math.min(maxDim, Math.max(minDim, v));
    const candidates = (v) => [
      ...new Set([
        clamp64(Math.floor(v / 64) * 64),
        clamp64(Math.ceil(v / 64) * 64),
      ]),
    ];

    let best = null;
    for (const w of candidates(idealW)) {
      for (const h of candidates(idealH)) {
        if (w * h > budget + 0.5) continue; // +0.5 absorbs float error
        const score = Math.abs(Math.log(w / h) - Math.log(ratio));
        if (
          !best ||
          score < best.score - 1e-9 ||
          (Math.abs(score - best.score) <= 1e-9 && w * h > best.w * best.h)
        ) {
          best = { w, h, score };
        }
      }
    }

    if (!best) {
      // Boundary clamping pushed every candidate over budget; degrade
      // gracefully to the rounded-down pair.
      return [
        clamp64(Math.floor(idealW / 64) * 64),
        clamp64(Math.floor(idealH / 64) * 64),
      ];
    }
    return [best.w, best.h];
  };

  if (typeof window !== "undefined") {
    window.__arhFitResolution = fitResolution; // exposed for standalone tests
  }

  const getSideLength = (page) => {
    const el = gradioApp().getElementById(`${page}_arh_side_length`);
    const v = Number(el?.value);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const getAlign64 = (page) =>
    gradioApp().getElementById(`${page}_arh_align64`)?.checked ?? true;

  const reverseOptions = (select) => {
    const list = Array.from(select?.querySelectorAll(".ar-option") ?? []);
    list.forEach((el) => {
      const rev = reverseAspectRatio(el.value);
      if (rev) {
        el.value = rev;
        el.textContent = rev;
      }
    });
  };

  const getSelectedImage2ImageTab = () => {
    const mode = gradioApp().getElementById("mode_img2img");
    if (!mode) return 0;
    const selected = mode.querySelector("button.selected");
    const all = mode.querySelectorAll("button");
    const idx = Array.prototype.indexOf.call(all, selected);
    return idx < 0 ? 0 : idx;
  };

  const getCurrentImage = () => {
    const idx = getSelectedImage2ImageTab();
    const id = _IMAGE_INPUT_CONTAINER_IDS[idx];
    return gradioApp().getElementById(id)?.querySelector("img");
  };

  const findWidthHeightContainers = (page) => {
    // These exist in Forge Neo too
    const w = gradioApp().querySelector(`#${page}_width`);
    const h = gradioApp().querySelector(`#${page}_height`);
    return { w, h };
  };

  const findResSwitchButton = (page) => {
    return (
      gradioApp().getElementById(page + "_res_switch_btn") ||
      gradioApp().querySelector(`#${page}_res_switch_btn`) ||
      gradioApp().querySelector(`button[id="${page}_res_switch_btn"]`) ||
      gradioApp().querySelector(`*[id="${page}_res_switch_btn"]`)
    );
  };

  class OptionPickingController {
    constructor(page, options, controller) {
      this.page = page;
      this.options = options;

      const nativeSwitchButton = findResSwitchButton(page);
      this.switchButton = nativeSwitchButton;
      this.injected = false;
      if (!this.switchButton) {
        console.warn(`[ARH] Cannot find ${page}_res_switch_btn - JS control not injected yet.`);
        return;
      }

      // Create wrapper and dropdown
      const wrapper = document.createElement("div");
      wrapper.id = `${this.page}_size_toolbox`;
      wrapper.className = "flex flex-col items-center gap-2";

      const selectWrap = document.createElement("div");
      selectWrap.id = `${this.page}_ratio`;
      selectWrap.className =
        "gr-block gr-box relative w-full border-solid border border-gray-200 gr-padded";

      const sel = document.createElement("select");
      sel.id = `${this.page}_select_aspect_ratio`;
      sel.className = "gr-box gr-input w-full disabled:cursor-not-allowed";

      sel.innerHTML = this.options
        .map((r) => `<option class="ar-option">${r}</option>`)
        .join("\n");

      selectWrap.appendChild(sel);

      wrapper.appendChild(selectWrap);

      const parent = this.switchButton.parentNode;
      if (!parent) {
        console.warn(`[ARH] ${page}_res_switch_btn has no parent — skip injection.`);
        return;
      }

      this.switchButton = nativeSwitchButton.cloneNode(true);
      parent.removeChild(nativeSwitchButton);
      wrapper.appendChild(this.switchButton);

      // Compact row with the side-length input and align-64 checkbox,
      // placed below the native Height slider (not in the accordion).
      gradioApp().getElementById(`${this.page}_arh_controls`)?.remove();
      const controlsRow = document.createElement("div");
      controlsRow.id = `${this.page}_arh_controls`;
      controlsRow.className = "arh-controls";

      const sideLabel = document.createElement("label");
      sideLabel.className = "arh-side-length";
      sideLabel.title =
        "Pixel budget for the aspect ratio presets (area ≈ side²). " +
        "0 = scale from the resolution currently set in the UI.";
      sideLabel.append("Side Length:");

      const sideInput = document.createElement("input");
      sideInput.type = "number";
      sideInput.id = `${this.page}_arh_side_length`;
      sideInput.min = "0";
      sideInput.max = String(controller.maxDimension || _MAXIMUM_DIMENSION);
      sideInput.step = "64";
      sideInput.value = String(getSharedOpt("arh_javascript_side_length", 1024));

      // borrow the native number-box styling so it matches width/height
      const { h: heightBlock } = findWidthHeightContainers(this.page);
      const nativeNumberInput = heightBlock?.querySelector("input[type=number]");
      if (nativeNumberInput) {
        sideInput.className = nativeNumberInput.className;
      } else {
        sideInput.classList.add("arh-side-input-fallback");
      }
      sideLabel.appendChild(sideInput);

      const alignLabel = document.createElement("label");
      alignLabel.className = "arh-align-64";
      alignLabel.title =
        "Align to multiple of 64. Some models allow variation within a " +
        "range (eg 1024 to 2048) but almost always want a multiple of 64";

      const alignInput = document.createElement("input");
      alignInput.type = "checkbox";
      alignInput.id = `${this.page}_arh_align64`;
      alignInput.checked = Boolean(getSharedOpt("arh_javascript_align_64", true));
      alignLabel.appendChild(alignInput);
      alignLabel.append("×64");

      controlsRow.append(sideLabel, alignLabel);
      // Insert as a sibling of the *whole* dimensions row (the FormRow
      // holding the width/height column, the switch-button column, and
      // the batch count/size column) — never as a child of the
      // width/height column itself. Growing that column's height shifts
      // whatever centers the switch/dropdown column against it, pushing
      // the dropdown out of alignment with the sliders. Sitting outside
      // the row entirely avoids touching that layout altogether while
      // still rendering directly below it.
      const dimensionsRow = heightBlock?.parentNode?.parentNode;
      if (dimensionsRow?.parentNode) {
        dimensionsRow.parentNode.insertBefore(controlsRow, dimensionsRow.nextSibling);
      } else if (heightBlock?.parentNode) {
        heightBlock.parentNode.insertBefore(controlsRow, heightBlock.nextSibling);
      } else {
        wrapper.appendChild(controlsRow);
      }

      // Re-apply the selected ratio when the budget or alignment changes.
      const reapply = () => {
        const picked = this.getCurrentOption();
        if (picked !== _OFF && picked !== _LOCK) controller.setAspectRatio(picked);
      };
      sideInput.addEventListener("change", reapply);
      alignInput.addEventListener("change", reapply);

      parent.appendChild(wrapper);

      sel.onchange = () => controller.setAspectRatio(this.getCurrentOption());
      this.switchButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        reverseOptions(sel);
        const picked = this.getCurrentOption();
        controller.swapDimensions(picked);
      });

      this.injected = true;
      console.log(`[ARH] Injected JS picker for ${page}`);
    }

    getCurrentOption() {
      const sel = gradioApp().getElementById(`${this.page}_select_aspect_ratio`);
      if (!sel) return _OFF;
      const options = Array.from(sel);
      return options[sel.selectedIndex]?.value ?? _OFF;
    }
  }

  class SliderController {
    constructor(element) {
      this.element = element;
      this.numberInput = this.element.querySelector('input[type=number]');
      this.rangeInput = this.element.querySelector('input[type=range]');
      this.inputs = [this.numberInput, this.rangeInput].filter(Boolean);
      this.inputs.forEach((input) => (input.isWidth = element.isWidth));
    }
    getVal() { return Number(this.numberInput?.value ?? 0); }
    updateVal(v) { this.inputs.forEach((i) => (i.value = Number(v))); }
    updateMin(v) { this.inputs.forEach((i) => (i.min = roundToClosestMultiple(Number(v), 8))); }
    updateMax(v) { this.inputs.forEach((i) => (i.max = roundToClosestMultiple(Number(v), 8))); }
    triggerEvent(ev) { this.numberInput?.dispatchEvent(ev); }
    setVal(v) { this.updateVal(roundToClosestMultiple(Number(v), 8)); }
  }

  class AspectRatioController {
    constructor(page, widthContainer, heightContainer, options) {
      this.page = page;
      widthContainer.isWidth = true;
      heightContainer.isWidth = false;

      this.widthContainer = new SliderController(widthContainer);
      this.heightContainer = new SliderController(heightContainer);

      // Respect whatever min/max Forge Neo's ui-config.json configured on
      // the native sliders. Overwriting these with a hard-coded 2048 on
      // every interaction was clobbering higher configured maximums
      // (e.g. 4096 for 4K) the moment the user touched anything.
      const nativeBound = (attr, pick) => {
        const values = [this.widthContainer.numberInput, this.heightContainer.numberInput]
          .map((input) => Number(input?.[attr]))
          .filter((v) => Number.isFinite(v) && v > 0);
        return values.length ? pick(...values) : null;
      };
      this.maxDimension = nativeBound('max', Math.max) ?? _MAXIMUM_DIMENSION;
      this.minDimension = nativeBound('min', Math.min) ?? _MINIMUM_DIMENSION;

      this.inputs = [...this.widthContainer.inputs, ...this.heightContainer.inputs];
      this.inputs.forEach((input) => {
        input.addEventListener("change", (e) => {
          e.preventDefault();
          this.maintainAspectRatio(input);
        });
      });

      // In lock mode, snap to a nearby standard resolution once the user
      // leaves the input — never while they may still be typing.
      [this.widthContainer.numberInput, this.heightContainer.numberInput]
        .filter(Boolean)
        .forEach((input) => {
          input.addEventListener("focusout", () => {
            if (this.aspectRatio === _LOCK) this.snapToStandardResolution(input);
          });
        });

      this.optionPickingControler = new OptionPickingController(page, options, this);
      this.setAspectRatio(_OFF);
    }

    disable() {
      this.widthContainer.updateMin(this.minDimension);
      this.heightContainer.updateMin(this.minDimension);
      this.widthContainer.updateMax(this.maxDimension);
      this.heightContainer.updateMax(this.maxDimension);
    }

    isLandscapeOrSquare() { return this.widthRatio >= this.heightRatio; }

    updateInputStates() {
      // round the ratio-derived bounds outward to multiples of 64 so they
      // never clash with the align-64 resolutions from fitResolution
      const floor64 = (v) => Math.floor(v / 64) * 64;
      const ceil64 = (v) => Math.ceil(v / 64) * 64;

      if (this.isLandscapeOrSquare()) {
        const AR = this.widthRatio / this.heightRatio;
        const minW = Math.max(floor64(this.minDimension * AR), this.minDimension);
        this.widthContainer.updateMin(minW);
        this.heightContainer.updateMin(this.minDimension);

        const maxH = Math.min(this.maxDimension, ceil64(this.maxDimension / AR));
        this.heightContainer.updateMax(maxH);
        this.widthContainer.updateMax(this.maxDimension);
      } else {
        const AR = this.heightRatio / this.widthRatio;
        const minH = Math.max(floor64(this.minDimension * AR), this.minDimension);
        this.heightContainer.updateMin(minH);
        this.widthContainer.updateMin(this.minDimension);

        const maxW = Math.min(this.maxDimension, ceil64(this.maxDimension / AR));
        this.widthContainer.updateMax(maxW);
        this.heightContainer.updateMax(this.maxDimension);
      }
    }

    setAspectRatio(aspectRatio, maintain = true) {
      this.aspectRatio = aspectRatio;
      if (aspectRatio === _OFF) return this.disable();

      let wR, hR;

      if (aspectRatio === _IMAGE) {
        const img = getCurrentImage();
        wR = img?.naturalWidth || 1;
        hR = img?.naturalHeight || 1;
      } else if (aspectRatio === _LOCK) {
        wR = this.widthContainer.getVal();
        hR = this.heightContainer.getVal();
      } else {
        const parsed = aspectRatioFromStr(aspectRatio);
        if (!parsed) return this.disable();
        [wR, hR] = parsed;
      }

      [wR, hR] = clampToBoundaries(wR, hR, this.maxDimension, this.minDimension);
      this.widthRatio = wR;
      this.heightRatio = hR;
      this.updateInputStates();

      // Lock only captures the current ratio; nothing to apply yet.
      if (!maintain || aspectRatio === _LOCK) return;
      this.applyRatioFromSideLength();
    }

    // Apply the selected ratio: fit it into the side-length pixel budget,
    // or fall back to scaling the current UI resolution when the budget
    // is 0.
    applyRatioFromSideLength() {
      const side = getSideLength(this.page);
      if (side > 0) {
        const align = getAlign64(this.page);
        const [w, h] = fitResolution(
          this.widthRatio, this.heightRatio, side, align,
          this.maxDimension, this.minDimension,
        );
        this.applyDimensions(w, h);
        return;
      }
      this.maintainAspectRatio();
    }

    // If the committed value sits within _SNAP_RANGE px of what the locked
    // ratio would produce at a standard side length, adopt that resolution.
    snapToStandardResolution(input) {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;

      const align = getAlign64(this.page);
      let best = null;
      for (const side of _STANDARD_SIDES) {
        const [w, h] = fitResolution(
          this.widthRatio, this.heightRatio, side, align,
          this.maxDimension, this.minDimension,
        );
        const distance = Math.abs(value - (input.isWidth ? w : h));
        if (distance <= _SNAP_RANGE && (!best || distance < best.distance)) {
          best = { w, h, distance };
        }
      }

      if (
        best &&
        (best.w !== this.widthContainer.getVal() ||
          best.h !== this.heightContainer.getVal())
      ) {
        this.applyDimensions(best.w, best.h);
      }
    }

    applyDimensions(width, height) {
      const ev = new Event("input", { bubbles: true });

      this.widthContainer.setVal(width);
      this.widthContainer.triggerEvent(ev);
      this.heightContainer.setVal(height);
      this.heightContainer.triggerEvent(ev);

      if (typeof dimensionChange === "function") {
        this.heightContainer.inputs.forEach((input) => dimensionChange({ target: input }, false, true));
        this.widthContainer.inputs.forEach((input) => dimensionChange({ target: input }, true, false));
      }
    }

    swapDimensions(aspectRatio) {
      const oldWidth = this.widthContainer.getVal();
      const oldHeight = this.heightContainer.getVal();
      const effectiveAspectRatio = aspectRatio === _LOCK ? `${oldHeight}:${oldWidth}` : aspectRatio;

      this.setAspectRatio(effectiveAspectRatio, false);
      const [width, height] = clampToBoundaries(oldHeight, oldWidth, this.maxDimension, this.minDimension);
      this.applyDimensions(width, height);
      // keep lock semantics (blur snapping) active after a swap
      if (aspectRatio === _LOCK) this.aspectRatio = _LOCK;
    }

    maintainAspectRatio(changedElement) {
      if (this.aspectRatio === _OFF) return;

      const align = getAlign64(this.page);
      const snap64 = (v) =>
        Math.max(this.minDimension, roundToClosestMultiple(v, 64));

      if (!changedElement) {
        const allValues = this.inputs.map((x) => Number(x.value));
        changedElement = { value: Math.max(...allValues) };
      }

      const ar = this.widthRatio / this.heightRatio;
      let w, h;

      if (changedElement.isWidth === undefined) {
        if (this.isLandscapeOrSquare()) { w = Math.round(changedElement.value); h = Math.round(changedElement.value / ar); }
        else { h = Math.round(changedElement.value); w = Math.round(changedElement.value * ar); }
        if (align) { w = snap64(w); h = snap64(h); }
      } else if (changedElement.isWidth) {
        w = Math.round(changedElement.value);
        h = Math.round(changedElement.value / ar);
        // only align the derived dimension, never the one the user set
        if (align) h = snap64(h);
      } else {
        h = Math.round(changedElement.value);
        w = Math.round(changedElement.value * ar);
        if (align) w = snap64(w);
      }

      const [width, height] = clampToBoundaries(w, h, this.maxDimension, this.minDimension);
      this.applyDimensions(width, height);
    }
  }

  const initWithRetry = (key, page, options) => {
    let tries = 0;
    const maxTries = 60; // 60 * 250ms = 15s

    const tick = () => {
      tries++;

      const { w, h } = findWidthHeightContainers(page);
      const sw = findResSwitchButton(page);
      if (!w || !h || !sw) {
        if (tries === 1 || tries === 10 || tries === 30 || tries === maxTries) {
          console.log(`[ARH] ${page} waiting controls... (try ${tries}/${maxTries}) w=${!!w} h=${!!h} sw=${!!sw}`);
        }
        if (tries >= maxTries) {
          console.warn(`[ARH] ${page} giving up: required controls not found`);
          clearInterval(timer);
        }
        return;
      }

      if (window[key]) {
        clearInterval(timer);
        return;
      }

      const controller = new AspectRatioController(page, w, h, options);
      if (!controller.optionPickingControler?.injected) {
        if (tries === 1 || tries === 10 || tries === 30 || tries === maxTries) {
          console.log(`[ARH] ${page} picker not injected yet (try ${tries}/${maxTries})`);
        }
        return;
      }

      console.log(`[ARH] ${page} init done. res_switch_btn=${!!sw}`);
      window[key] = true;
      clearInterval(timer);
    };

    const timer = setInterval(tick, 250);
    tick();
  };

  const run = () => {
    console.log("[ARH] init start");

    const configuredRatios = getConfiguredRatios();
    const txt2imgOptions = [_OFF, _LOCK, ...configuredRatios];
    const img2imgOptions = [_OFF, _LOCK, _IMAGE, ...configuredRatios];

    initWithRetry("__txt2imgAspectRatioController", "txt2img", txt2imgOptions);
    initWithRetry("__img2imgAspectRatioController", "img2img", img2imgOptions);
  };

  if (typeof document === "undefined") return; // standalone test environment

  if (typeof onOptionsAvailable === "function") onOptionsAvailable(run);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
