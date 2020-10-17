"use strict";

$(".selectpicker").selectpicker({
  iconBase: "fas",
  tickIcon: "fa-check",
});

$("#run-button").click(function (e) {
  e.preventDefault();
  run(editor);
});

function run(editor) {
  clearMarkers(editor);
  showLoading();
  const cancelToken = showSpinner(terminal, "Running");

  const params = {
    toolchain_version: $("#versionPicker").val(),
    code: editor.getValue(),
  };
  $.post("/run", params)
    .done(function (data) {
      hideSpinner(terminal, cancelToken);

      terminal.write(`\x1b[38;5;72m${data.version}\x1b[0m`);
      terminal.write(`${data.errors}\x1b[0m`);
      terminal.write(`\x1b[37m${data.output}\x1b[0m`);

      const annotations = parceErrorMessage(data.errors);
      updateAnnotations(editor, annotations);
    })
    .fail(function (response) {
      hideSpinner(terminal, cancelToken);
      alert(`[Status: ${response.status}] Something went wrong`);
    })
    .always(function () {
      hideLoading();
      editor.focus();
    });
}

function clearMarkers(editor) {
  Object.entries(editor.session.getMarkers()).forEach(([key, value]) => {
    editor.session.removeMarker(value.id);
  });
}

function parceErrorMessage(message) {
  const matches = message
    .replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ""
    )
    .matchAll(
      /\/\[REDACTED\]\/main\.swift:(\d+):(\d+): (error|warning|note): ([\s\S]*?)\n*(?=(?:\/|$))/gi
    );
  return [...matches].map((match) => {
    return {
      row: match[1] - 1,
      column: match[2] - 1,
      text: match[4],
      type: match[3].replace("note", "info"),
      full: match[0],
    };
  });
}

function updateAnnotations(editor, annotations) {
  editor.session.setAnnotations(annotations);

  annotations.forEach((annotation) => {
    const marker = annotation.text.match(/\^\~*/i);
    editor.session.addMarker(
      new Range(
        annotation.row,
        annotation.column,
        annotation.row,
        annotation.column + (marker ? marker[0].length : 1)
      ),
      `editor-marker-${annotation.type}`,
      "text"
    );
  });
}

function showLoading() {
  $("#run-button").addClass("disabled");
  $("#run-button-text").hide();
  $("#run-button-icon").hide();
  $("#run-button-spinner").show();
}

function hideLoading() {
  $("#run-button").removeClass("disabled");
  $("#run-button-text").show();
  $("#run-button-icon").show();
  $("#run-button-spinner").hide();
}

function showSpinner(terminal, message) {
  const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let spins = 0;
  function updateSpinner(terminal, message) {
    const progressText = `${SPINNER[spins % SPINNER.length]} ${message}`;
    terminal.write("\x1b[2K\r");
    terminal.write(
      `\x1b[37m${progressText} ${".".repeat(
        Math.floor((spins * 2) / 4) % 4
      )} \x1b[0m`
    );
    spins++;
  }

  updateSpinner(terminal, message);
  return setInterval(() => {
    updateSpinner(terminal, message);
  }, 200);
}

function hideSpinner(terminal, cancelToken) {
  clearInterval(cancelToken);
  terminal.write("\x1b[2K\r");
}