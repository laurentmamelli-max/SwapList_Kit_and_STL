(function () {
  "use strict";

  const SWAP_TAIL_GCODE =
    ";swap \n" +
    "G0 X-10 F5000; \n " +
    "G0 Z175; \n " +
    "G0 Y-5 F2000;  \n  " +
    "G0 Y186.5 F2000;  \n  " +
    "G0 Y182 F10000;  \n  " +
    "G0 Z186 ; \n " +
    "G0 Y120 F500; \n " +
    "G0 Y-4 Z175 F5000; \n " +
    "G0 Y145; \n  " +
    "G0 Y115 F1000; \n " +
    "G0 Y25 F500; \n " +
    "G0 Y85 F1000; \n " +
    "G0 Y180 F2000; \n " +
    "G4 P500; wait  \n " +
    "G0 Y186.5 F200; \n " +
    "G4 P500; wait  \n " +
    "G0 Y3 F3000; \n " +
    "G0 Y-5 F200; \n" +
    "G4 P500; wait  \n " +
    "G0 Y10 F1000; \n " +
    "G0 Z100 Y186 F2000; \n " +
    "G0 Y150; \n " +
    "G4 P1000; wait  \n ";

  const STARTER_SWAP_GCODE =
    ";swap ini code\n" +
    "G91 ; \n" +
    "G0 Z50 F1000; \n" +
    "G0 Z-20; \n" +
    "G90; \n " +
    "G28 XY; \n " +
    "G0 Y-4 F5000; grab \n " +
    "G0 Y145;  pull and fix the plate\n" +
    "G0 Y115 F1000; rehook \n " +
    "G0 Y180 F5000; pull\n " +
    "G4 P500; wait  \n " +
    "G0 Y186.5 F200; fix the plate\n " +
    "G4 P500; wait  \n " +
    "G0 Y3 F15000; back \n " +
    "G0 Y-5 F200; snap \n" +
    "G4 P500; wait  \n " +
    "G0 Y10 F1000; load \n " +
    "G0 Y20 F15000; ready \n ";

  const SUPPORTED_EXTENSIONS = [".3mf", ".gcode.3mf", ".gcode"];
  const PROFILE_CONFIG = {
    kit: {
      key: "kit",
      label: "KIT",
      extension: ".swap.3mf",
      platerName: "SWAP",
      help: "Pilier KIT: sortie en .swap.3mf."
    },
    stl: {
      key: "stl",
      label: "STL",
      extension: ".swaps.3mf",
      platerName: "SWAPS",
      help: "Pilier STL: sortie en .swaps.3mf."
    }
  };
  const NATIVE_STATUS_MESSAGES = {
    idle: {
      badge: "Local",
      title: "Pret a importer",
      message: "Dans l'app macOS, les .3mf bruts peuvent etre convertis automatiquement avant ajout a la queue."
    }
  };

  const state = {
    fileCounter: 0,
    queueCounter: 0,
    files: [],
    queue: [],
    profileMode: "kit"
  };

  const ui = {};

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    ui.fileInput = document.getElementById("file-input");
    ui.dropzone = document.getElementById("dropzone");
    ui.dropzoneSubtitle = document.getElementById("dropzone-subtitle");
    ui.browseButton = document.getElementById("browse-button");
    ui.nativeStatus = document.getElementById("native-status");
    ui.nativeStatusBadge = document.getElementById("native-status-badge");
    ui.nativeStatusTitle = document.getElementById("native-status-title");
    ui.nativeStatusMessage = document.getElementById("native-status-message");
    ui.profileHelp = document.getElementById("profile-help");
    ui.profileModeInputs = Array.from(document.querySelectorAll("input[name=\"profile-mode\"]"));
    ui.outputName = document.getElementById("output-name");
    ui.formatGuidance = document.getElementById("format-guidance");
    ui.loopRepeats = document.getElementById("loop-repeats");
    ui.waitTime = document.getElementById("wait-time");
    ui.keepLast = document.getElementById("keep-last");
    ui.noVibration = document.getElementById("no-vibration");
    ui.stlCompatRow = document.getElementById("stl-compat-row");
    ui.stlKitCompatible = document.getElementById("stl-kit-compatible");
    ui.exportButton = document.getElementById("export-button");
    ui.resetButton = document.getElementById("reset-button");
    ui.metricDuration = document.getElementById("metric-duration");
    ui.metricPlates = document.getElementById("metric-plates");
    ui.filamentSummary = document.getElementById("filament-summary");
    ui.queueEmpty = document.getElementById("queue-empty");
    ui.queueList = document.getElementById("queue-list");
    ui.logOutput = document.getElementById("log-output");
    ui.progressBarFill = document.getElementById("progress-bar-fill");
    ui.progressText = document.getElementById("progress-text");

    ui.fileInput.addEventListener("change", onFileInputChange);
    ui.dropzone.addEventListener("click", onDropzoneClick);
    ui.dropzone.addEventListener("keydown", onDropzoneKeyDown);
    ui.dropzone.addEventListener("dragover", onDragOver);
    ui.dropzone.addEventListener("dragleave", onDragLeave);
    ui.dropzone.addEventListener("drop", onDrop);
    ui.browseButton.addEventListener("click", onBrowseButtonClick);
    ui.profileModeInputs.forEach(function (input) {
      input.addEventListener("change", onProfileModeChange);
    });
    ui.exportButton.addEventListener("click", exportSwapFile);
    ui.resetButton.addEventListener("click", resetApp);
    ui.loopRepeats.addEventListener("input", renderAll);
    ui.waitTime.addEventListener("input", renderControls);
    ui.keepLast.addEventListener("change", renderControls);
    ui.noVibration.addEventListener("change", renderControls);
    ui.stlKitCompatible.addEventListener("change", renderControls);

    window.__swapmodImportFromNative = importFilesFromNative;
    window.__swapmodSetNativeStatus = setNativeStatusFromNative;
    window.__swapmodClearNativeStatus = clearNativeStatusFromNative;

    setProgress(0, "Pret");
    applyNativeCapabilityCopy();
    clearNativeStatusFromNative();
    renderAll();
  }

  function onFileInputChange(event) {
    if (!event.target.files || !event.target.files.length) {
      return;
    }
    importFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  function onDropzoneClick(event) {
    if (event.target === ui.fileInput) {
      return;
    }
    if (event.target && event.target.closest("button")) {
      return;
    }
    openFilePicker();
  }

  function onDropzoneKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  }

  function onBrowseButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    openFilePicker();
  }

  function onProfileModeChange(event) {
    state.profileMode = event.target.value === "stl" ? "stl" : "kit";
    renderControls();
    logLine("Profil actif: " + getCurrentProfile().label);
  }

  function applyNativeCapabilityCopy() {
    if (hasNativeBridge()) {
      ui.dropzoneSubtitle.textContent =
        "ou clique pour selectionner des .3mf / .gcode.3mf / .gcode. Les .3mf bruts seront convertis automatiquement.";
      ui.formatGuidance.textContent =
        "Dans l'app macOS: .gcode.3mf, .gcode et .3mf bruts sont acceptes.";
      ui.nativeStatus.hidden = false;
      return;
    }

    ui.dropzoneSubtitle.textContent =
      "ou clique pour selectionner des .3mf / .gcode.3mf / .gcode";
    ui.formatGuidance.textContent =
      "Dans le navigateur: prefere .gcode.3mf ou .gcode. Les .3mf bruts doivent etre convertis avant import.";
    ui.nativeStatus.hidden = true;
  }

  function onDragOver(event) {
    event.preventDefault();
    ui.dropzone.classList.add("is-dragover");
  }

  function onDragLeave(event) {
    event.preventDefault();
    ui.dropzone.classList.remove("is-dragover");
  }

  function onDrop(event) {
    event.preventDefault();
    ui.dropzone.classList.remove("is-dragover");
    if (!event.dataTransfer || !event.dataTransfer.files.length) {
      return;
    }
    importFiles(Array.from(event.dataTransfer.files));
  }

  function openFilePicker() {
    try {
      if (typeof ui.fileInput.showPicker === "function") {
        ui.fileInput.showPicker();
        return;
      }
    } catch (error) {
      logLine("showPicker indisponible, fallback vers click().");
    }

    ui.fileInput.click();
  }

  async function importFiles(files) {
    logLine("Import de " + files.length + " fichier(s)...");

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileLabel = file.name || "fichier-sans-nom";

      if (!isSupportedFile(fileLabel)) {
        logLine("Ignore: " + fileLabel + " n'est pas un format supporte.");
        continue;
      }

      setProgress(Math.round(((index + 1) / files.length) * 30), "Lecture des projets...");

      try {
        const importedFile = await parseImportedFile(file);
        state.files.push(importedFile);
        state.queue.push.apply(state.queue, importedFile.plates.map(buildQueueItem));

        if (!ui.outputName.value) {
          ui.outputName.placeholder = computeDefaultOutputName();
        }

        logLine(
          "OK: " +
            fileLabel +
            " charge avec " +
            importedFile.plates.length +
            " plate(s)."
        );
      } catch (error) {
        logLine("Erreur avec " + fileLabel + ": " + error.message);
      }
    }

    setProgress(0, "Pret");
    renderAll();
  }

  function getCurrentProfile() {
    return PROFILE_CONFIG[state.profileMode] || PROFILE_CONFIG.kit;
  }

  function getExportOptions() {
    return {
      waitMinutes: sanitizeInteger(ui.waitTime.value, 0, 1440, 0),
      keepLastPlate: Boolean(ui.keepLast.checked),
      noVibrationAfterFirst: Boolean(ui.noVibration.checked),
      stlKitCompatible: state.profileMode === "stl" && Boolean(ui.stlKitCompatible.checked)
    };
  }

  function buildModelSettingsTemplate(profile) {
    return (
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<config>\n" +
      "  <plate>\n" +
      "    <metadata key=\"plater_id\" value=\"1\"/>\n" +
      "    <metadata key=\"plater_name\" value=\"" + profile.platerName + "\"/>\n" +
      "    <metadata key=\"locked\" value=\"false\"/>\n" +
      "    <metadata key=\"gcode_file\" value=\"Metadata/plate_1.gcode\"/>\n" +
      "    <metadata key=\"thumbnail_file\" value=\"Metadata/plate_1.png\"/>\n" +
      "    <metadata key=\"top_file\" value=\"Metadata/top_1.png\"/>\n" +
      "    <metadata key=\"pick_file\" value=\"Metadata/pick_1.png\"/>\n" +
      "    <metadata key=\"pattern_bbox_file\" value=\"Metadata/plate_1.json\"/>\n" +
      "  </plate>\n" +
      "</config> "
    );
  }

  function setNativeStatusFromNative(payload) {
    if (!ui.nativeStatus) {
      return;
    }

    const safePayload = payload || {};
    ui.nativeStatus.hidden = false;
    ui.nativeStatus.classList.toggle("is-busy", Boolean(safePayload.busy));
    ui.nativeStatusBadge.textContent = safePayload.badge || "Info";
    ui.nativeStatusTitle.textContent = safePayload.title || "Operation en cours";
    ui.nativeStatusMessage.textContent = safePayload.message || "";
  }

  function clearNativeStatusFromNative() {
    if (!hasNativeBridge()) {
      ui.nativeStatus.hidden = true;
      return;
    }

    const idle = NATIVE_STATUS_MESSAGES.idle;
    setNativeStatusFromNative({
      badge: idle.badge,
      title: idle.title,
      message: idle.message,
      busy: false
    });
  }

  function isSupportedFile(fileName) {
    const lower = fileName.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(function (extension) {
      return lower.endsWith(extension);
    });
  }

  async function parseImportedFile(sourceFile) {
    const lower = sourceFile.name.toLowerCase();
    if (lower.endsWith(".gcode") && !lower.endsWith(".gcode.3mf")) {
      return parseGcodeFile(sourceFile);
    }
    return parse3mfFile(sourceFile);
  }

  async function parse3mfFile(sourceFile) {
    const zip = await JSZip.loadAsync(sourceFile);

    const modelSettingsEntry = zip.file("Metadata/model_settings.config");
    const sliceInfoEntry = zip.file("Metadata/slice_info.config");

    if (!modelSettingsEntry || !sliceInfoEntry) {
      throw new Error("Metadata/model_settings.config ou Metadata/slice_info.config manquant.");
    }

    const modelSettingsText = await modelSettingsEntry.async("text");
    const sliceInfoText = await sliceInfoEntry.async("text");
    const projectSettingsEntry = zip.file("Metadata/project_settings.config");
    const projectSettingsText = projectSettingsEntry
      ? await projectSettingsEntry.async("text")
      : null;

    const parser = new DOMParser();
    const modelDoc = parser.parseFromString(modelSettingsText, "text/xml");
    const sliceDoc = parser.parseFromString(sliceInfoText, "text/xml");

    const modelPlates = Array.from(modelDoc.getElementsByTagName("plate"));
    if (!modelPlates.length) {
      throw new Error("Aucune plate detectee dans model_settings.config.");
    }

    const importedFile = {
      id: "file-" + (++state.fileCounter),
      name: sourceFile.name,
      sourceFile: sourceFile,
      modelSettingsText: modelSettingsText,
      sliceInfoText: sliceInfoText,
      projectSettingsText: projectSettingsText,
      plates: [],
      maxFilamentSlot: 0
    };
    let plateCountWithGcodeReference = 0;
    const missingGcodePaths = [];

    for (let plateIndex = 0; plateIndex < modelPlates.length; plateIndex += 1) {
      const modelPlate = modelPlates[plateIndex];
      const gcodePath = getMetadataValue(modelPlate, "gcode_file");
      if (!gcodePath) {
        continue;
      }

      plateCountWithGcodeReference += 1;

      const gcodeEntry = zip.file(gcodePath);
      if (!gcodeEntry) {
        missingGcodePaths.push(gcodePath);
        continue;
      }

      const thumbnailPath = getMetadataValue(modelPlate, "thumbnail_file");
      const gcodeText = await gcodeEntry.async("text");
      const slicePlate = findSlicePlate(sliceDoc, plateIndex + 1);
      const filaments = parseFilaments(slicePlate);
      const duration = parseDuration(gcodeText);
      let thumbnailUrl = null;

      if (thumbnailPath) {
        const thumbnailEntry = zip.file(thumbnailPath);
        if (thumbnailEntry) {
          const thumbBlob = await thumbnailEntry.async("blob");
          thumbnailUrl = URL.createObjectURL(thumbBlob);
        }
      }

      importedFile.plates.push({
        id: "plate-" + importedFile.id + "-" + (plateIndex + 1),
        fileId: importedFile.id,
        fileName: importedFile.name,
        order: plateIndex,
        path: gcodePath,
        displayName: derivePlateName(gcodePath),
        thumbnailUrl: thumbnailUrl,
        durationText: duration.label,
        durationSeconds: duration.seconds,
        filaments: filaments,
        gcodeText: gcodeText
      });

      filaments.forEach(function (filament) {
        importedFile.maxFilamentSlot = Math.max(importedFile.maxFilamentSlot, filament.slot);
      });
    }

    if (!importedFile.plates.length) {
      if (plateCountWithGcodeReference > 0 && missingGcodePaths.length === plateCountWithGcodeReference) {
        throw new Error(buildMissingGcodeErrorMessage(missingGcodePaths));
      }

      throw new Error("Aucune plate exploitable n'a ete trouvee dans ce 3MF.");
    }

    return importedFile;
  }

  async function parseGcodeFile(sourceFile) {
    const gcodeText = await sourceFile.text();
    const duration = parseDuration(gcodeText);
    const filaments = parseFilamentsFromGcode(gcodeText);

    const importedFile = {
      id: "file-" + (++state.fileCounter),
      name: sourceFile.name,
      sourceFile: sourceFile,
      sourceKind: "gcode",
      modelSettingsText: buildModelSettingsTemplate(getCurrentProfile()),
      sliceInfoText: buildSyntheticSliceInfoTemplate(),
      projectSettingsText: null,
      plates: [],
      maxFilamentSlot: 0
    };

    importedFile.plates.push({
      id: "plate-" + importedFile.id + "-1",
      fileId: importedFile.id,
      fileName: importedFile.name,
      order: 0,
      path: "Metadata/plate_1.gcode",
      displayName: derivePlateName(importedFile.name),
      thumbnailUrl: null,
      durationText: duration.label,
      durationSeconds: duration.seconds,
      filaments: filaments,
      gcodeText: gcodeText
    });

    filaments.forEach(function (filament) {
      importedFile.maxFilamentSlot = Math.max(importedFile.maxFilamentSlot, filament.slot);
    });

    return importedFile;
  }

  function buildMissingGcodeErrorMessage(missingGcodePaths) {
    const uniquePaths = Array.from(new Set(missingGcodePaths));
    const missingLabel = uniquePaths.slice(0, 3).join(", ");
    const baseMessage =
      "Ce 3MF semble etre un projet non slice: le G-code embarque est absent (" +
      missingLabel +
      ").";

    return (
      baseMessage +
      " Dans le navigateur, importe un .gcode.3mf ou un .gcode. Dans l'app macOS, ajoute directement le .3mf brut pour laisser la conversion locale faire le travail."
    );
  }

  function getMetadataValue(parent, key) {
    const metadataNodes = Array.from(parent.getElementsByTagName("metadata"));
    const match = metadataNodes.find(function (node) {
      return node.getAttribute("key") === key;
    });
    return match ? match.getAttribute("value") : null;
  }

  function findSlicePlate(sliceDoc, index) {
    const plates = Array.from(sliceDoc.getElementsByTagName("plate"));
    const directMatch = plates.find(function (plate) {
      const indexMetadata = Array.from(plate.getElementsByTagName("metadata")).find(function (node) {
        return node.getAttribute("key") === "index";
      });
      return indexMetadata && Number(indexMetadata.getAttribute("value")) === index;
    });

    return directMatch || plates[0] || null;
  }

  function parseFilaments(slicePlate) {
    if (!slicePlate) {
      return [];
    }

    return Array.from(slicePlate.getElementsByTagName("filament")).map(function (filamentNode) {
      return {
        slot: Number(filamentNode.getAttribute("id")) || 0,
        type: filamentNode.getAttribute("type") || "unknown",
        color: filamentNode.getAttribute("color") || "#b8b8b8",
        usedM: Number(filamentNode.getAttribute("used_m")) || 0,
        usedG: Number(filamentNode.getAttribute("used_g")) || 0
      };
    });
  }

  function parseFilamentsFromGcode(gcodeText) {
    const extrusion = estimateExtrudedFilamentMm(gcodeText);
    if (extrusion <= 0) {
      return [];
    }

    const filamentArea = Math.PI * Math.pow(1.75 / 2, 2);
    const volumeMm3 = extrusion * filamentArea;
    const densityGPerMm3 = 1.24 / 1000;
    return [
      {
        slot: 1,
        type: "Generic PLA",
        color: "#b8b8b8",
        usedM: extrusion / 1000,
        usedG: volumeMm3 * densityGPerMm3
      }
    ];
  }

  function parseDuration(gcodeText) {
    const match = gcodeText.match(/total estimated time:\s*([^\n\r]+)/i);
    const fallbackSeconds = estimateDurationSecondsFromGcode(gcodeText);
    const label = match ? match[1].trim() : secondsToDhms(fallbackSeconds);
    return {
      label: label,
      seconds: match ? durationStringToSeconds(label) : fallbackSeconds
    };
  }

  function estimateExtrudedFilamentMm(gcodeText) {
    let totalExtrusion = 0;
    let currentE = 0;

    gcodeText.split(/\r?\n/).forEach(function (rawLine) {
      const line = rawLine.replace(/;.*$/, "").trim();
      if (!line) {
        return;
      }

      if (/^G92\b/i.test(line)) {
        const resetE = extractAxisValue(line, "E");
        if (resetE !== null) {
          currentE = resetE;
        }
        return;
      }

      if (!/^G0?\b/i.test(line) && !/^G1\b/i.test(line)) {
        return;
      }

      const nextE = extractAxisValue(line, "E");
      if (nextE === null) {
        return;
      }

      if (nextE > currentE) {
        totalExtrusion += nextE - currentE;
      }
      currentE = nextE;
    });

    return totalExtrusion;
  }

  function estimateDurationSecondsFromGcode(gcodeText) {
    let seconds = 0;
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let feedrate = 1800;

    gcodeText.split(/\r?\n/).forEach(function (rawLine) {
      const line = rawLine.replace(/;.*$/, "").trim();
      if (!line || (!/^G0\b/i.test(line) && !/^G1\b/i.test(line))) {
        return;
      }

      const nextFeedrate = extractAxisValue(line, "F");
      if (nextFeedrate !== null && nextFeedrate > 0) {
        feedrate = nextFeedrate;
      }

      const nextX = extractAxisValue(line, "X");
      const nextY = extractAxisValue(line, "Y");
      const nextZ = extractAxisValue(line, "Z");
      const targetX = nextX !== null ? nextX : currentX;
      const targetY = nextY !== null ? nextY : currentY;
      const targetZ = nextZ !== null ? nextZ : currentZ;
      const distance = Math.sqrt(
        Math.pow(targetX - currentX, 2) +
          Math.pow(targetY - currentY, 2) +
          Math.pow(targetZ - currentZ, 2)
      );

      if (distance > 0 && feedrate > 0) {
        seconds += distance / (feedrate / 60);
      }

      currentX = targetX;
      currentY = targetY;
      currentZ = targetZ;
    });

    return Math.max(0, Math.round(seconds));
  }

  function extractAxisValue(line, axis) {
    const match = line.match(new RegExp(axis + "(-?\\d+(?:\\.\\d+)?)", "i"));
    return match ? Number(match[1]) : null;
  }

  function durationStringToSeconds(label) {
    let seconds = 0;
    const day = label.match(/(\d+)\s*d/i);
    const hour = label.match(/(\d+)\s*h/i);
    const minute = label.match(/(\d+)\s*m/i);
    const second = label.match(/(\d+)\s*s/i);

    if (day) {
      seconds += Number(day[1]) * 86400;
    }
    if (hour) {
      seconds += Number(hour[1]) * 3600;
    }
    if (minute) {
      seconds += Number(minute[1]) * 60;
    }
    if (second) {
      seconds += Number(second[1]);
    }

    return seconds;
  }

  function derivePlateName(path) {
    const raw = path
      .replace(/^Metadata\//i, "")
      .replace(/\.gcode$/i, "")
      .replace(/\.gcode\.3mf$/i, "")
      .replace(/\.3mf$/i, "");
    return raw.replace(/_/g, " ");
  }

  function buildSyntheticSliceInfoTemplate() {
    return (
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<config>\n" +
      "  <plate>\n" +
      "    <metadata key=\"index\" value=\"1\"/>\n" +
      "  </plate>\n" +
      "</config>\n"
    );
  }

  function buildQueueItem(plate) {
    return {
      id: "queue-" + (++state.queueCounter),
      fileId: plate.fileId,
      plateId: plate.id,
      title: plate.displayName,
      fileName: plate.fileName,
      durationText: plate.durationText,
      durationSeconds: plate.durationSeconds,
      filaments: plate.filaments,
      gcodeText: plate.gcodeText,
      thumbnailUrl: plate.thumbnailUrl,
      repeats: 1
    };
  }

  function computeDefaultOutputName() {
    if (!state.files.length) {
      return "mix";
    }
    if (state.files.length === 1) {
      return state.files[0].name
        .replace(/\.gcode\.3mf$/i, "")
        .replace(/\.gcode$/i, "")
        .replace(/\.3mf$/i, "");
    }
    return "mix";
  }

  function renderAll() {
    renderQueue();
    renderStats();
    renderControls();
  }

  function renderQueue() {
    ui.queueList.innerHTML = "";

    if (!state.queue.length) {
      ui.queueEmpty.hidden = false;
      return;
    }

    ui.queueEmpty.hidden = true;

    state.queue.forEach(function (item, index) {
      const listItem = document.createElement("li");
      listItem.className = "queue-item" + (Number(item.repeats) <= 0 ? " is-disabled" : "");

      const thumb = document.createElement("div");
      thumb.className = "queue-thumb";
      if (item.thumbnailUrl) {
        const image = document.createElement("img");
        image.src = item.thumbnailUrl;
        image.alt = item.title;
        thumb.appendChild(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "No preview";
        thumb.appendChild(placeholder);
      }

      const main = document.createElement("div");
      main.className = "queue-main";

      const titleRow = document.createElement("div");
      titleRow.className = "queue-title-row";
      titleRow.innerHTML =
        "<div>" +
        "<h3 class=\"queue-title\">" + escapeHtml(item.title) + "</h3>" +
        "<p class=\"queue-file\">" + escapeHtml(item.fileName) + "</p>" +
        "</div>" +
        "<span class=\"badge\">#" + String(index + 1).padStart(2, "0") + "</span>";

      const badges = document.createElement("div");
      badges.className = "queue-badges";
      badges.innerHTML =
        "<span class=\"badge\">Temps: " + escapeHtml(item.durationText) + "</span>" +
        "<span class=\"badge\">Filaments: " + item.filaments.length + "</span>";

      const filamentRow = document.createElement("div");
      filamentRow.className = "queue-filaments";
      if (item.filaments.length) {
        item.filaments.forEach(function (filament) {
          const tag = document.createElement("span");
          tag.className = "filament-tag";
          tag.innerHTML =
            "<span class=\"swatch\" style=\"background:" + escapeHtml(filament.color) + "\"></span>" +
            "Slot " + filament.slot + " " + escapeHtml(filament.type) +
            " " + round2(filament.usedG) + "g";
          filamentRow.appendChild(tag);
        });
      } else {
        const empty = document.createElement("span");
        empty.className = "empty-text";
        empty.textContent = "Aucune info filament";
        filamentRow.appendChild(empty);
      }

      const controls = document.createElement("div");
      controls.className = "queue-controls";

      const repeatLabel = document.createElement("label");
      repeatLabel.innerHTML = "Repeats";

      const repeatInput = document.createElement("input");
      repeatInput.type = "number";
      repeatInput.min = "0";
      repeatInput.step = "1";
      repeatInput.value = String(item.repeats);
      repeatInput.addEventListener("input", function () {
        item.repeats = sanitizeRepeatValue(repeatInput.value);
        repeatInput.value = String(item.repeats);
        renderAll();
      });

      repeatLabel.appendChild(repeatInput);
      controls.appendChild(repeatLabel);

      const actions = document.createElement("div");
      actions.className = "queue-actions";

      const upButton = buildActionButton("Monter", function () {
        moveQueueItem(index, -1);
      }, index === 0);
      const downButton = buildActionButton("Descendre", function () {
        moveQueueItem(index, 1);
      }, index === state.queue.length - 1);
      const removeButton = buildActionButton("Desactiver", function () {
        item.repeats = 0;
        renderAll();
      }, Number(item.repeats) === 0);
      const enableButton = buildActionButton("Activer", function () {
        item.repeats = Math.max(1, Number(item.repeats) || 1);
        renderAll();
      }, Number(item.repeats) > 0);

      actions.appendChild(upButton);
      actions.appendChild(downButton);
      actions.appendChild(removeButton);
      actions.appendChild(enableButton);

      main.appendChild(titleRow);
      main.appendChild(badges);
      main.appendChild(filamentRow);
      main.appendChild(controls);

      listItem.appendChild(thumb);
      listItem.appendChild(main);
      listItem.appendChild(actions);

      ui.queueList.appendChild(listItem);
    });
  }

  function buildActionButton(label, handler, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  }

  function sanitizeRepeatValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(0, Math.floor(parsed));
  }

  function sanitizeInteger(value, minValue, maxValue, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(maxValue, Math.max(minValue, Math.floor(parsed)));
  }

  function moveQueueItem(index, delta) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= state.queue.length) {
      return;
    }
    const temp = state.queue[index];
    state.queue[index] = state.queue[targetIndex];
    state.queue[targetIndex] = temp;
    renderAll();
  }

  function renderStats() {
    const loopRepeats = getLoopRepeats();
    let totalDuration = 0;
    let totalPlates = 0;
    const filamentBySlot = new Map();

    state.queue.forEach(function (item) {
      const repeats = Number(item.repeats) || 0;
      if (repeats <= 0) {
        return;
      }

      totalDuration += item.durationSeconds * repeats;
      totalPlates += repeats;

      item.filaments.forEach(function (filament) {
        const key = String(filament.slot);
        if (!filamentBySlot.has(key)) {
          filamentBySlot.set(key, {
            slot: filament.slot,
            type: filament.type,
            color: filament.color,
            usedM: 0,
            usedG: 0
          });
        }

        const aggregate = filamentBySlot.get(key);
        aggregate.usedM += filament.usedM * repeats;
        aggregate.usedG += filament.usedG * repeats;
      });
    });

    totalDuration *= loopRepeats;
    totalPlates *= loopRepeats;

    filamentBySlot.forEach(function (aggregate) {
      aggregate.usedM *= loopRepeats;
      aggregate.usedG *= loopRepeats;
    });

    ui.metricDuration.textContent = secondsToDhms(totalDuration);
    ui.metricPlates.textContent = String(totalPlates);

    ui.filamentSummary.innerHTML = "";
    if (!filamentBySlot.size) {
      const empty = document.createElement("span");
      empty.className = "empty-text";
      empty.textContent = state.queue.length ? "Aucune plate active" : "Aucun fichier charge";
      ui.filamentSummary.appendChild(empty);
      return;
    }

    Array.from(filamentBySlot.values())
      .sort(function (a, b) {
        return a.slot - b.slot;
      })
      .forEach(function (aggregate) {
        const chip = document.createElement("div");
        chip.className = "filament-chip";
        chip.innerHTML =
          "<strong>Slot " + aggregate.slot + "</strong>" +
          "<span>" + escapeHtml(aggregate.type) + "</span>" +
          "<span>" + round2(aggregate.usedM) + "m / " + round2(aggregate.usedG) + "g</span>";
        chip.style.borderTop = "4px solid " + aggregate.color;
        ui.filamentSummary.appendChild(chip);
      });
  }

  function renderControls() {
    const profile = getCurrentProfile();
    const hasActiveItems = state.queue.some(function (item) {
      return Number(item.repeats) > 0;
    });
    ui.profileHelp.textContent = profile.help;
    ui.stlCompatRow.hidden = profile.key !== "stl";
    ui.exportButton.disabled = !hasActiveItems;
    ui.exportButton.textContent =
      "Generer " + profile.extension;
  }

  async function exportSwapFile() {
    try {
      const profile = getCurrentProfile();
      const exportOptions = getExportOptions();
      const selectedItems = getSelectedItems();
      if (!selectedItems.length) {
        throw new Error("Aucune plate active a exporter.");
      }

      setProgress(5, "Preparation de l'export...");
      logLine(
        "Export " +
          profile.label +
          " en cours..." +
          (exportOptions.stlKitCompatible ? " mode compatible kit actif." : "")
      );

      const templateFile = chooseTemplateFile(selectedItems);
      const templateZip = await createTemplateZip(templateFile);
      const aggregatedFilaments = aggregateFilamentsForSelectedItems(selectedItems);
      const queueGcodes = buildLoopedGcodeQueue(selectedItems, profile, exportOptions);
      const optimizedQueue = removeRedundantAmsSwaps(queueGcodes);
      const gcodeBlob = new Blob(optimizedQueue, { type: "text/x-gcode" });

      setProgress(35, "Mise a jour du projet 3MF...");
      cleanTemplateZip(templateZip);
      applyProjectSettings(templateZip, selectedItems);
      updateSliceInfo(templateZip, templateFile, aggregatedFilaments);
      templateZip.file("Metadata/model_settings.config", buildModelSettingsTemplate(profile));
      templateZip.file("Metadata/plate_1.gcode", gcodeBlob);

      setProgress(55, "Calcul du MD5...");
      const md5 = await computeBlobMd5(gcodeBlob, function (percent) {
        setProgress(55 + Math.round(percent * 0.18), "Calcul du MD5...");
      });
      templateZip.file("Metadata/plate_1.gcode.md5", md5);

      setProgress(75, "Compression finale...");
      const archiveBlob = await templateZip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 3 }
        },
        function (metadata) {
          setProgress(75 + Math.round(metadata.percent * 0.25), "Compression finale...");
        }
      );

      const outputName = (ui.outputName.value || ui.outputName.placeholder || "mix").trim() || "mix";
      await downloadBlob(outputName + profile.extension, archiveBlob);
      logLine("Export termine: " + outputName + profile.extension);
      setProgress(100, "Export termine");
      window.setTimeout(function () {
        setProgress(0, "Pret");
      }, 1200);
    } catch (error) {
      logLine("Export impossible: " + error.message);
      setProgress(0, "Erreur");
    }
  }

  function getSelectedItems() {
    const loopRepeats = getLoopRepeats();
    const selected = [];

    state.queue.forEach(function (item) {
      const repeats = Number(item.repeats) || 0;
      for (let copyIndex = 0; copyIndex < repeats; copyIndex += 1) {
        selected.push(item);
      }
    });

    if (loopRepeats <= 1) {
      return selected;
    }

    const looped = [];
    for (let loopIndex = 0; loopIndex < loopRepeats; loopIndex += 1) {
      looped.push.apply(looped, selected);
    }
    return looped;
  }

  function chooseTemplateFile(selectedItems) {
    const selectedFileIds = new Set(selectedItems.map(function (item) {
      return item.fileId;
    }));

    let bestFile = null;
    state.files.forEach(function (file) {
      if (!selectedFileIds.has(file.id)) {
        return;
      }

      if (!bestFile || file.maxFilamentSlot > bestFile.maxFilamentSlot) {
        bestFile = file;
      }
    });

    if (!bestFile) {
      throw new Error("Impossible de choisir un template 3MF.");
    }

    return bestFile;
  }

  async function createTemplateZip(templateFile) {
    if (templateFile.sourceKind === "gcode") {
      const zip = new JSZip();
      zip.file("Metadata/model_settings.config", templateFile.modelSettingsText || buildModelSettingsTemplate(getCurrentProfile()));
      zip.file("Metadata/slice_info.config", templateFile.sliceInfoText || buildSyntheticSliceInfoTemplate());
      if (templateFile.projectSettingsText) {
        zip.file("Metadata/project_settings.config", templateFile.projectSettingsText);
      }
      return zip;
    }

    return JSZip.loadAsync(templateFile.sourceFile);
  }

  function aggregateFilamentsForSelectedItems(selectedItems) {
    const aggregate = new Map();

    selectedItems.forEach(function (item) {
      item.filaments.forEach(function (filament) {
        const key = String(filament.slot);
        if (!aggregate.has(key)) {
          aggregate.set(key, {
            slot: filament.slot,
            type: filament.type,
            color: filament.color,
            usedM: 0,
            usedG: 0
          });
        }

        const target = aggregate.get(key);
        target.usedM += filament.usedM;
        target.usedG += filament.usedG;
      });
    });

    return Array.from(aggregate.values()).sort(function (a, b) {
      return a.slot - b.slot;
    });
  }

  function buildLoopedGcodeQueue(selectedItems, profile, exportOptions) {
    if (!selectedItems.length) {
      return [];
    }

    const queue = selectedItems.map(function (item, index) {
      const isLast = index === selectedItems.length - 1;
      return buildPlateGcode(item, index, isLast, profile, exportOptions);
    });
    queue[0] = buildProfileHeader(profile, exportOptions) + STARTER_SWAP_GCODE + queue[0];
    return queue;
  }

  function buildPlateGcode(item, index, isLast, profile, exportOptions) {
    let gcode = item.gcodeText;

    if (exportOptions.noVibrationAfterFirst && index > 0) {
      gcode = suppressVibrationCalibration(gcode);
    }

    if (isLast && exportOptions.keepLastPlate) {
      return gcode;
    }

    return gcode + buildSwapTail(profile, exportOptions);
  }

  function buildProfileHeader(profile, exportOptions) {
    const lines = [
      ";swapmod-local profile=" + profile.key,
      ";swapmod-local extension=" + profile.extension,
      ";swapmod-local wait_minutes=" + exportOptions.waitMinutes,
      ";swapmod-local keep_last=" + (exportOptions.keepLastPlate ? "1" : "0"),
      ";swapmod-local no_vibration_after_first=" + (exportOptions.noVibrationAfterFirst ? "1" : "0")
    ];

    if (profile.key === "stl") {
      lines.push(
        ";swapmod-local stl_kit_compatible=" + (exportOptions.stlKitCompatible ? "1" : "0")
      );
    }

    return lines.join("\n") + "\n";
  }

  function buildSwapTail(profile, exportOptions) {
    const lines = [SWAP_TAIL_GCODE.trimEnd()];

    if (exportOptions.waitMinutes > 0) {
      lines.push(
        ";swapmod-local wait before swap " + exportOptions.waitMinutes + " minute(s)",
        "G4 S" + String(exportOptions.waitMinutes * 60)
      );
    }

    if (profile.key === "stl" && exportOptions.stlKitCompatible) {
      lines.push(";swapmod-local stl kit compatible");
    }

    return lines.join("\n") + "\n";
  }

  function suppressVibrationCalibration(gcodeText) {
    return gcodeText.replace(/^(\s*)(M970\b[^\n\r]*)/gm, "$1;$2");
  }

  function removeRedundantAmsSwaps(gcodes) {
    const amsFlag = "\nM620 S";
    const positions = [];

    gcodes.forEach(function (gcode, plateIndex) {
      let cursor = gcode.indexOf(amsFlag);
      while (cursor !== -1) {
        let value = gcode.substring(cursor + 7, cursor + 10);
        if (value[2] === "\n" || value[2] === " ") {
          value = value.substring(0, 2);
        }

        positions.push({
          plateIndex: plateIndex,
          index: cursor + 1,
          value: value
        });

        cursor = gcode.indexOf(amsFlag, cursor + 1);
      }
    });

    for (let i = 0; i < positions.length - 1; i += 1) {
      if (
        positions[i].value === "255" &&
        positions[i - 1] &&
        positions[i + 1] &&
        positions[i - 1].value === positions[i + 1].value
      ) {
        gcodes[positions[i].plateIndex] = disableAmsBlock(
          gcodes[positions[i].plateIndex],
          positions[i].index
        );
        gcodes[positions[i + 1].plateIndex] = disableAmsBlock(
          gcodes[positions[i + 1].plateIndex],
          positions[i + 1].index
        );
      }
    }

    return gcodes;
  }

  function disableAmsBlock(gcode, index) {
    if (index > gcode.length - 1) {
      return gcode;
    }

    const blockEnd = gcode.substring(index).search("M621 S");
    if (blockEnd < 0) {
      return gcode;
    }

    let replacement = ";SWAP - AMS block removed";
    while (replacement.length < blockEnd - 1) {
      replacement += "/";
    }
    replacement += ";";

    if (replacement.length > 2000) {
      return gcode;
    }

    return gcode.substring(0, index) + replacement + gcode.substring(index + blockEnd);
  }

  function cleanTemplateZip(zip) {
    Object.keys(zip.files).forEach(function (path) {
      if (/^Metadata\/plate_\d+\.gcode(?:\.md5)?$/i.test(path)) {
        zip.remove(path);
      }
      if (/^Metadata\/custom_gcode_per_layer\.xml$/i.test(path)) {
        zip.remove(path);
      }
    });
  }

  function applyProjectSettings(zip, selectedItems) {
    const templateFile = chooseTemplateFile(selectedItems);
    if (templateFile.projectSettingsText) {
      zip.file("Metadata/project_settings.config", templateFile.projectSettingsText);
    }
  }

  function updateSliceInfo(zip, templateFile, aggregatedFilaments) {
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const sliceInfoEntry = zip.file("Metadata/slice_info.config");
    if (!sliceInfoEntry) {
      throw new Error("Le template ne contient pas de slice_info.config.");
    }

    const existingText = templateFile.sliceInfoText;
    const sliceDoc = parser.parseFromString(existingText, "text/xml");
    const plates = Array.from(sliceDoc.getElementsByTagName("plate"));

    if (!plates.length) {
      throw new Error("slice_info.config ne contient aucune plate.");
    }

    plates.slice(1).forEach(function (plate) {
      plate.remove();
    });

    const firstPlate = plates[0];
    const metadataNodes = Array.from(firstPlate.getElementsByTagName("metadata"));
    let indexNode = metadataNodes.find(function (node) {
      return node.getAttribute("key") === "index";
    });

    if (!indexNode) {
      indexNode = sliceDoc.createElement("metadata");
      indexNode.setAttribute("key", "index");
      firstPlate.insertBefore(indexNode, firstPlate.firstChild);
    }
    indexNode.setAttribute("value", "1");

    Array.from(firstPlate.getElementsByTagName("filament")).forEach(function (node) {
      node.remove();
    });

    aggregatedFilaments.forEach(function (filament) {
      const node = sliceDoc.createElement("filament");
      node.setAttribute("id", String(filament.slot));
      node.setAttribute("type", filament.type);
      node.setAttribute("color", filament.color);
      node.setAttribute("used_m", round2(filament.usedM));
      node.setAttribute("used_g", round2(filament.usedG));
      firstPlate.appendChild(node);
    });

    const serialized = serializer.serializeToString(sliceDoc).replace(/></g, ">\n<");
    zip.file("Metadata/slice_info.config", serialized);
  }

  function computeBlobMd5(blob, onProgress) {
    return new Promise(function (resolve, reject) {
      const chunkSize = 2 * 1024 * 1024;
      const chunks = Math.ceil(blob.size / chunkSize);
      const spark = new SparkMD5.ArrayBuffer();
      const fileReader = new FileReader();
      let currentChunk = 0;

      fileReader.onload = function (event) {
        spark.append(event.target.result);
        currentChunk += 1;

        if (typeof onProgress === "function") {
          onProgress(chunks ? currentChunk / chunks : 1);
        }

        if (currentChunk < chunks) {
          loadNextChunk();
        } else {
          resolve(spark.end());
        }
      };

      fileReader.onerror = function () {
        reject(new Error("Impossible de calculer le MD5 du G-code exporte."));
      };

      function loadNextChunk() {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, blob.size);
        fileReader.readAsArrayBuffer(blob.slice(start, end));
      }

      if (!blob.size) {
        resolve(spark.end());
        return;
      }

      loadNextChunk();
    });
  }

  function downloadBlob(filename, blob) {
    if (hasNativeBridge()) {
      return saveBlobViaNativeBridge(filename, blob);
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    return Promise.resolve();
  }

  function hasNativeBridge() {
    return Boolean(
      window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.swapmodApp
    );
  }

  function saveBlobViaNativeBridge(filename, blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onload = function () {
        const dataUrl = String(reader.result || "");
        const commaIndex = dataUrl.indexOf(",");
        const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";

        try {
          window.webkit.messageHandlers.swapmodApp.postMessage({
            type: "saveBlob",
            filename: filename,
            mimeType: blob.type || "application/octet-stream",
            base64: base64
          });
          resolve();
        } catch (error) {
          reject(new Error("Impossible de transmettre le fichier a l'app macOS."));
        }
      };

      reader.onerror = function () {
        reject(new Error("Impossible de preparer le fichier pour l'app macOS."));
      };

      reader.readAsDataURL(blob);
    });
  }

  async function importFilesFromNative(payloads) {
    if (!Array.isArray(payloads) || !payloads.length) {
      return;
    }

    const files = payloads.map(function (payload) {
      const bytes = base64ToUint8Array(payload.base64 || "");
      return new File([bytes], payload.name || "import.3mf", {
        type: payload.mimeType || "application/octet-stream"
      });
    });

    await importFiles(files);
  }

  function base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  function resetApp() {
    state.files.forEach(function (file) {
      file.plates.forEach(function (plate) {
        if (plate.thumbnailUrl) {
          URL.revokeObjectURL(plate.thumbnailUrl);
        }
      });
    });

    state.files = [];
    state.queue = [];
    state.fileCounter = 0;
    state.queueCounter = 0;
    ui.fileInput.value = "";
    ui.outputName.value = "";
    ui.outputName.placeholder = "mix";
    ui.loopRepeats.value = "1";
    ui.waitTime.value = "0";
    ui.keepLast.checked = false;
    ui.noVibration.checked = false;
    ui.stlKitCompatible.checked = false;
    state.profileMode = "kit";
    ui.profileModeInputs.forEach(function (input) {
      input.checked = input.value === "kit";
    });
    ui.logOutput.textContent = "Application reinitialisee.";
    setProgress(0, "Pret");
    renderAll();
  }

  function getLoopRepeats() {
    const parsed = Number(ui.loopRepeats.value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.floor(parsed));
  }

  function setProgress(percent, label) {
    const clamped = Math.max(0, Math.min(100, percent));
    ui.progressBarFill.style.width = clamped + "%";
    ui.progressText.textContent = label;
  }

  function logLine(message) {
    const timestamp = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    ui.logOutput.textContent += "\n[" + timestamp + "] " + message;
    ui.logOutput.scrollTop = ui.logOutput.scrollHeight;
  }

  function secondsToDhms(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return (
      (days ? days + "d " : "") +
      (hours ? hours + "h " : "") +
      minutes + "m " +
      remainingSeconds + "s"
    );
  }

  function round2(value) {
    return String(Math.round((Number(value) || 0) * 100) / 100);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
