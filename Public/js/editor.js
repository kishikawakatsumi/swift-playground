"use strict";

$('.selectpicker').selectpicker({
  iconBase: 'fas',
  tickIcon: 'fa-check'
});

const lang = ace.require("ace/lib/lang");
const langTools = ace.require("ace/ext/language_tools");

const editor = ace.edit("editor");
editor.setTheme("ace/theme/xcode");
editor.session.setMode("ace/mode/swift");
editor.$blockScrolling = Infinity
editor.setOptions({
  useSoftTabs: true,
  autoScrollEditorIntoView: true,
  fontFamily: "Menlo,sans-serif,monospace",
  fontSize: "11pt",
  showInvisibles: false,
  enableBasicAutocompletion: true,
  enableSnippets: true,
  enableLiveAutocompletion: true,
});
editor.renderer.setOptions({
  showFoldWidgets: false,
  showPrintMargin: false,
});
editor.container.style.lineHeight = 1.5;

if (!editor.completer) {
  editor.execCommand("startAutocomplete")
  editor.completer.detach()
}
editor.completer.popup.container.style.width = "30%"

const row = editor.session.getLength() - 1
const column = editor.session.getLine(row).length
editor.gotoLine(row + 1, column)
editor.focus();

const sessionId = uuidv4()

editor.on('change', (change, editor) => {
  switch (change.action) {
    case "insert":
      let lines = change.lines;
      let character = lines[0];
      if (lines.length === 1 && character.length === 1 && character === ".") {
        setTimeout(() => {
          editor.commands.byName.startAutocomplete.exec(editor);
        }, 0);
      }
      break;
  }

  $.post('/notification/textDocument/didChange', {
    session: sessionId,
    change: change,
    text: editor.getValue()
  });

  if (!editor.getValue()) {
    $("#run-button").prop('disabled', true)
    $("#share-button").prop('disabled', true)
  } else {
    $("#run-button").prop('disabled', false)
    $("#share-button").prop('disabled', false)
  }
});
editor.commands.addCommand({
  name: "triggerAutoCompletion",
  bindKey: {
    win: "escape",
    mac: "escape"
  },
  exec: (editor) => {
    const cursorPosition = editor.getCursorPosition();
    setTimeout(() => {
      editor.commands.byName.startAutocomplete.exec(editor);
    }, 0);
  }
})

ace.require("ace/autocomplete").FilteredList.prototype.setFilter = function (str) {
  if (str.length > this.filterText && str.lastIndexOf(this.filterText, 0) === 0)
    var matches = this.filtered;
  else
    var matches = this.all;

  let customItems = [];
  const index = matches.findIndex((e) => e["sourcekit-lsp"])
  if (index >= 0) {
    customItems = matches.splice(index);
  }

  this.filterText = str;
  matches = this.filterCompletions(matches, this.filterText);
  matches = matches.sort(function (a, b) {
    return b.exactMatch - a.exactMatch || b.$score - a.$score ||
      (a.caption || a.value).localeCompare(b.caption || b.value);
  });

  matches = customItems.concat(matches);

  // make unique
  var prev = null;
  matches = matches.filter(function (item) {
    var caption = item.snippet || item.caption || item.value;
    if (caption === prev) return false;
    prev = caption;
    return true;
  });

  this.filtered = matches;
};

let completions = [];
var completer = {
  getCompletions: (editor, session, pos, prefix, callback) => {
    if (completions.length) {
      callback(null, completions);
      completions = [];
      return;
    }
    $.post("/request/textDocument/completion", {
      session: sessionId,
      cursorPosition: {
        row: pos.row,
        column: pos.column
      },
      prefix: prefix
    }, (data, error, xhr) => {
      if (data && data.length) {
        completions = data.map((item) => {
          let insertText = item.lebel;
          if (item.textEdit) {
            insertText = item.textEdit.newText;
          }
          return {
            caption: item.filterText || item.label,
            name: item.label,
            value: insertText,
            meta: item.detail,
            "sourcekit-lsp-kind": item.kind,
            "sourcekit-lsp": true,
          };
        })
        editor.commands.byName.startAutocomplete.exec(editor);
      }
    });
  },
  getDocTooltip: (item) => {
    if (!item["sourcekit-lsp"]) {
      return;
    }

    let kind = null;
    switch (item["sourcekit-lsp-kind"]) {
      case 1:
        kind = "M"; // method
        break;
      case 2:
        kind = "F"; // function
        break;
      case 6:
        kind = "C"; // class
        break;
      case 7:
        kind = "I"; // interface
        break;
      case 10:
        kind = "P"; // property
        break;
      case 12:
        kind = "E"; // enum
        break;
      case 21:
        kind = "S"; // struct
        break;
    }
    const img = kind ?
      `<img srcset="images/${kind}.png, images/${kind}@2x.png 2x, images/${kind}@3x.png 3x" width="16" height="16" align="center" style="vertical-align: text-bottom;"/>` :
      ""
    item.docHTML =
      `${img} ${hljs.highlight("swift", `${lang.escapeHTML(item.name)} -> ${lang.escapeHTML(item.meta)}`).value}`;
  }
};
langTools.addCompleter(completer);

$.post('/request/initialize', {
  session: sessionId,
  text: editor.getValue()
}, (data, error, xhr) => {
  $(window).on('beforeunload', (e) => {
    $.post('/notification/textDocument/didClose', {
      session: sessionId
    });
  });
});

const resultsEditor = ace.edit("results-editor");
resultsEditor.setTheme("ace/theme/terminal");
resultsEditor.session.setMode("ace/mode/text");
resultsEditor.$blockScrolling = Infinity
resultsEditor.setOptions({
  readOnly: true,
  highlightActiveLine: false,
  highlightSelectedWord: false,
  autoScrollEditorIntoView: true,
});
resultsEditor.renderer.setOptions({
  showGutter: false,
  showPrintMargin: false,
  showInvisibles: false,
  fontFamily: "Menlo,sans-serif,monospace",
  fontSize: "11pt",
});
resultsEditor.container.style.lineHeight = 1.5;
resultsEditor.renderer.hideCursor();

$("#run-button").click(function (e) {
  e.preventDefault();
  run($(this), editor);
});

function run(sender, editor) {
  const buttonTitle = deactivate(sender);
  const intid = showProgress(resultsEditor);
  const code = editor.getValue();
  const params = {
    toolchain_version: $("#versionPicker").val().replace('/', '_'),
    code: code
  };
  console.log(params)
  $.post('/run', params, (data, error, xhr) => {
    resultsEditor.setValue(data.version + data.errors + data.output);
    resultsEditor.clearSelection();
    clearInterval(intid);
    editor.focus();
    activate(sender, buttonTitle);
  });
}

function activate(button, buttonTitle) {
  button.prop("disabled", false);
  button.html(buttonTitle);
}

function deactivate(button) {
  button.prop("disabled", true);
  var buttonTitle = button.html();
  button.html('<i class="fa fa-circle-o-notch fa-spin" aria-hidden="true"></i> Processing...');
  resultsEditor.setValue("");
  return buttonTitle
}

function showProgress(editor) {
  let counter = 0
  return setInterval(() => {
    if (counter == 0) {
      resultsEditor.setValue('Executing...');
      counter += 1;
    } else {
      resultsEditor.setValue(resultsEditor.getValue() + '.');
    }
    resultsEditor.clearSelection();
  }, 1500);
}

function showShareSheet() {
  const code = editor.getValue();
  const params = {
    toolchain_version: $("#versionPicker").val().replace("/", "_"),
    code: code,
  };
  $.post("/shared_link", params, (data, error, xhr) => {
    if (data) {
      const url = data.url
      $("#shared_link").val(url);
      $(".btn-facebook").attr("href", `https://www.facebook.com/sharer/sharer.php?u=${url}`)
      $(".btn-twitter").attr("href", `https://twitter.com/intent/tweet?text=&url=${url}`)
      $(".btn-line").attr("href", `https://social-plugins.line.me/lineit/share?url=${url}`)
      $(".btn-pocket").attr("href", `https://getpocket.com/edit?url=${url}`)
      $("#shareSheet").modal();
    }
  });
  $("#shareSheet").modal();
}

function copySharedLink() {
  console.log(navigator.clipboard);
  console.log($("#shared_link").val());
  if (navigator.clipboard) {
    navigator.clipboard.writeText($("#shared_link").val());
  }
  const message = $(".share-sheet-copy-message");
  message.hide();
  message.text("link copied!");
  message.fadeIn(500).delay(1000).fadeOut(500);
}

function handleFileSelect(event) {
  event.stopPropagation();
  event.preventDefault();

  const files = event.dataTransfer.files;
  const reader = new FileReader();
  reader.onload = (event) => {
    const editor = ace.edit("editor");
    editor.setValue(event.target.result);
    editor.clearSelection();
  }
  reader.readAsText(files[0], "UTF-8");
}

function handleDragOver(event) {
  event.stopPropagation();
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

const dropZone = document.getElementById('editor');
dropZone.addEventListener('dragover', handleDragOver, false);
dropZone.addEventListener('drop', handleFileSelect, false);