import { editor_css } from './styles/editor';
import { inject_css } from './styles/injector';
import { default_css_theme } from './styles/theme-default';
import { escape_html } from './utils/html-escape';
import getCursorCoordinates from './utils/cursor-coordinates';
import Prism from 'prismjs';

export default class CodeFlask {
  constructor(selectorOrElement, opts) {
    if (!selectorOrElement) {
      // If no selector or element is passed to CodeFlask,
      // stop execution and throw error.
      throw Error('CodeFlask expects a parameter which is Element or a String selector');
      return;
    }

    if (!opts) {
      // If no selector or element is passed to CodeFlask,
      // stop execution and throw error.
      throw Error('CodeFlask expects an object containing options as second parameter');
      return;
    }

    if (selectorOrElement.nodeType) {
      // If it is an element, assign it directly
      this.editorRoot = selectorOrElement;
    } else {
      // If it is a selector, tries to find element
      const editorRoot = document.querySelector(selectorOrElement);

      // If an element is found using this selector,
      // assign this element as the root element
      if (editorRoot) {
        this.editorRoot = editorRoot;
      }
    }

    this.opts = opts;
    this.startEditor();
  }

  startEditor() {
    const isCSSInjected = inject_css(editor_css, null, this.opts.styleParent);

    if (!isCSSInjected) {
      throw Error('Failed to inject CodeFlask CSS.');
      return;
    }

    // The order matters (pre > code). Don't change it
    // or things are going to break.
    this.createWrapper();
    this.createTextarea();
    this.createPre();
    this.createCode();

    // Autosuggestions
    this.createAutoSugg();

    this.runOptions();
    this.listenTextarea();
    this.populateDefault();
    this.updateCode(this.code);
  }

  createWrapper() {
    this.code = this.editorRoot.innerHTML;
    this.editorRoot.innerHTML = '';
    this.elWrapper = this.createElement('div', this.editorRoot);
    this.elWrapper.classList.add('codeflask');
  }

  createTextarea() {
    this.elTextarea = this.createElement('textarea', this.elWrapper);
    this.elTextarea.classList.add('codeflask__textarea', 'codeflask__flatten');
  }

  createPre() {
    this.elPre = this.createElement('pre', this.elWrapper);
    this.elPre.classList.add('codeflask__pre', 'codeflask__flatten');
  }

  createCode() {
    this.elCode = this.createElement('code', this.elPre);
    this.elCode.classList.add('codeflask__code', `language-${this.opts.language || 'html'}`);
  }

  createLineNumbers() {
    this.elLineNumbers = this.createElement('div', this.elWrapper);
    this.elLineNumbers.classList.add('codeflask__lines');
    this.setLineNumber();
  }

  createElement(elementTag, whereToAppend) {
    const element = document.createElement(elementTag);
    whereToAppend.appendChild(element);

    return element;
  }

  // Create auto suggestions components like list
  createAutoSugg() {
    this.elAutoSuggResults = this.createElement('div', this.elWrapper);
    this.elAutoSuggResults.classList.add('codeflask__auto-suggestions-list');
    this.elAutoSuggResults.hidden = true;
  }

  runOptions() {
    this.opts.rtl = this.opts.rtl || false;
    this.opts.tabSize = this.opts.tabSize || 2;
    this.opts.enableAutocorrect = this.opts.enableAutocorrect || false;
    this.opts.lineNumbers = this.opts.lineNumbers || false;
    this.opts.defaultTheme = this.opts.defaultTheme !== false;
    // Set word wrap
    this.opts.wordWrap = this.opts.wordWrap || false;
    this.opts.autoSuggestions = this.opts.autoSuggestions || false;

    if (this.opts.rtl === true) {
      this.elTextarea.setAttribute('dir', 'rtl');
      this.elPre.setAttribute('dir', 'rtl');
    }

    if (this.opts.enableAutocorrect === false) {
      this.elTextarea.setAttribute('spellcheck', 'false');
      this.elTextarea.setAttribute('autocapitalize', 'off');
      this.elTextarea.setAttribute('autocomplete', 'off');
      this.elTextarea.setAttribute('autocorrect', 'off');
    }

    if (this.opts.lineNumbers) {
      this.elWrapper.classList.add('codeflask--has-line-numbers');
      this.createLineNumbers();
    }

    if (this.opts.defaultTheme) {
      inject_css(default_css_theme, 'theme-default', this.opts.styleParent);
    }

    // If wordwrap then enable it
    if (this.opts.wordWrap) {
      this.elTextarea.classList.add('word-wrap');
      this.elPre.classList.add('word-wrap');
    }

    // Default theme options
    this.defaultThemeOptions = {
      lineHeight: 20,
      fontSize: 13
    };

    this.opts.themeOptions = Object.assign(this.defaultThemeOptions, this.opts.themeOptions || {})
  }

  updateLineNumbersCount() {
    let numberList = '';

    for (let i = 1; i <= this.lineNumber; i++) {
      numberList = numberList + `<span class="codeflask__lines__line">${i}</span>`;
    }

    this.elLineNumbers.innerHTML = numberList;
  }

  listenTextarea() {
    this.elTextarea.addEventListener('input', (e) => {
      this.code = e.target.value;
      this.elCode.innerHTML = escape_html(e.target.value);
      this.highlight();
      setTimeout(() => {
        this.runUpdate();
        this.setLineNumber();
      }, 1);

    });

    this.elTextarea.addEventListener('keydown', (e) => {
      this.handleTabs(e);
      this.handleSelfClosingCharacters(e);
      this.handleNewLineIndentation(e);
      this.handleAutoSuggKeysDown(e);
    });

    this.elTextarea.addEventListener('scroll', (e) => {
      this.elPre.style.transform = `translate3d(-${e.target.scrollLeft}px, -${e.target.scrollTop}px, 0)`;
      if (this.elLineNumbers) {
        this.elLineNumbers.style.transform = `translate3d(0, -${e.target.scrollTop}px, 0)`;
      }
    });
  }

  handleTabs(e) {
    if (e.keyCode !== 9) {
      return;
    }
    e.preventDefault();

    const tabCode = 9;
    const pressedCode = e.keyCode;
    const selectionStart = this.elTextarea.selectionStart;
    const selectionEnd = this.elTextarea.selectionEnd;
    const newCode = `${this.code.substring(0, selectionStart)}${' '.repeat(this.opts.tabSize)}${this.code.substring(selectionEnd)}`;

    this.updateCode(newCode);
    this.elTextarea.selectionEnd = selectionEnd + this.opts.tabSize;
  }

  handleSelfClosingCharacters(e) {
    const openChars = ['(', '[', '{', '<'];
    const key = e.key;

    if (!openChars.includes(key)) {
      return;
    }

    switch(key) {
      case '(':
      this.closeCharacter(')');
      break;

      case '[':
      this.closeCharacter(']');
      break;

      case '{':
      this.closeCharacter('}');
      break;

      case '<':
      this.closeCharacter('>');
      break;
    }
  }

  setLineNumber() {
    this.lineNumber = this.code.split('\n').length;

    if (this.opts.lineNumbers) {
      this.updateLineNumbersCount();
    }
  }

  handleNewLineIndentation(e) {
    if (e.keyCode !== 13) {
      return;
    };

    // TODO: Make this shit work right

    // const selectionStart = this.elTextarea.selectionStart;
    // const selectionEnd = this.elTextarea.selectionEnd;
    // const allLines = this.code.split('\n').length;
    // const lines = this.code.substring(0, selectionStart).split('\n');
    // const currentLine = lines.length;
    // const lastLine = lines[currentLine - 1];

    // console.log(currentLine, allLines);

    // if (lastLine !== undefined && currentLine < allLines) {
    //   e.preventDefault();
    //   const spaces = lastLine.match(/^ {1,}/);

    //   if (spaces) {
    //     console.log(spaces[0].length);
    //     const newCode = `${this.code.substring(0, selectionStart)}\n${' '.repeat(spaces[0].length)}${this.code.substring(selectionEnd)}`;
    //     this.updateCode(newCode);
    //     setTimeout(() => {
    //       this.elTextarea.selectionEnd = selectionEnd + spaces[0].length + 1;
    //     }, 0);
    //   }
    // }
  }

  // PUBLIC
  // Create auto suggest results in DOM and update coordinates
  setAutoSuggestionsResults(results) {
    // If results then show auto suggestions
    if (results && results.length > 0) {
      this.autoSuggestionsList = results;
      this.createAutoSuggResults(results);
      this.updateAutoSuggResultsCoordinates();
      this.setAutoSuggSelected(this.autoSuggSelectedIndex || 0);
      this.showAutoSuggResults();
    } else {
      this.hideAutoSuggResults();
    }
  }

  // PUBLIC
  // Should be used by client to feed the results based on user input
  onAutoSuggestionsSelect(callback) {
    if (callback && {}.toString.call(callback) !== '[object Function]') {
      throw Error('CodeFlask expects callback of type Function');
      return;
    }

    this.onAutoSuggSelectCallback = callback;
  }

  // Handle keydown events to move current selected up or down in auto suggest results
  handleAutoSuggKeysDown(e) {
    // If its any of enter, tab, up and down key then dont proceed
    if ([38, 40, 13, 9].indexOf(e.keyCode) === -1) return;

    if (this.elAutoSuggResults.hidden || !this.autoSuggestionsList) return;

    // stop the event
    e.stopPropagation();
    e.preventDefault();

    // on enter call
    if (e.keyCode === 13) {
      let all = this.elAutoSuggResults.querySelectorAll('li');
      if (all[this.autoSuggSelectedIndex]) this.triggerAutoSuggSelect(all[this.autoSuggSelectedIndex]);
    }

    let index = this.getAutoSuggSelected();

    // Arrow up and down logic
    if (index !== null && e.keyCode === 38) {
      if (index === 0) {
        index = this.autoSuggestionsList.length - 1;
      } else {
        index -= 1
      }
    } else if (index !== null && e.keyCode === 40) {
      if (index === this.autoSuggestionsList.length - 1) {
        index = 0
      } else {
        index += 1
      }
    } else {
      index = 0
    }

    this.setAutoSuggSelected(index);
  }

  // Get selected item in auto suggest list
  getAutoSuggSelected() {
    let el = this.elAutoSuggResults.querySelector('li.selected');
    if (el) {
      return parseInt(el.getAttribute('idx'))
    }

    return null
  }

  // Set item as selected in auto suggest list
  setAutoSuggSelected(index) {
    let all = this.elAutoSuggResults.querySelectorAll('li');
    if (!all[index]) return;

    all.forEach((el) => {
      el.classList.remove('selected');
    })

	all[index].classList.add('selected');
	all[index].scrollIntoView(false);
    this.autoSuggSelectedIndex = index;
  }

  // Create auto suggest list with given results
  createAutoSuggResults(results) {
    let html = '';
    for (let index=0; index < results.length; index++) {
      let item = results[index];
      let title = item.title;
      let description = item.description;
      html += `<li class="index-${index}" idx="${index}"><span class="title">${title}</span><span class="description">${description}</span>`;
    }

    this.elAutoSuggResults.innerHTML = `<ul>${html}</ul>`;

    let all = this.elAutoSuggResults.querySelectorAll('li');
    all.forEach(el => {
      el.addEventListener('click', (e) => {
        let t = e.target;
        if (e.target.tagName === 'SPAN') {
          t = e.target.parentNode
        }

        this.triggerAutoSuggSelect(t);
      })
    });
  }

  // When called it triggers auto suggest callback set by client
  triggerAutoSuggSelect(el) {
    if (this.onAutoSuggSelectCallback) {
      this.onAutoSuggSelectCallback(this.autoSuggestionsList[parseInt(el.getAttribute('idx'))]);
    }
  }

  // Show auto suggest results in DOM
  showAutoSuggResults() {
    this.elAutoSuggResults.hidden = false
  }

  // Hide auto suggest results in DOM
  hideAutoSuggResults() {
    this.elAutoSuggResults.hidden = true
  }

  // Update left and top coordinates of auto suggest coordinates
  updateAutoSuggResultsCoordinates(cursorPosition, autoSuggestMinWidth) {
    cursorPosition = cursorPosition || this.elTextarea.selectionEnd

    // Get cursor coordinates relative to textarea
	let coordinates = getCursorCoordinates(this.elTextarea, cursorPosition)
	let editorWidth = this.elTextarea.getBoundingClientRect().width
	let autoSuggestWidth = autoSuggestMinWidth || 300
    this.elAutoSuggResults.style.top = (coordinates.top + this.opts.themeOptions.lineHeight) + 'px'
	let offsetLeft = 0
	if (autoSuggestWidth+coordinates.left > editorWidth) {
		offsetLeft = coordinates.left - ((autoSuggestWidth+coordinates.left) - editorWidth)
	} else {
		offsetLeft = coordinates.left
	}
	this.elAutoSuggResults.style.left = offsetLeft + 'px'
  }

  closeCharacter(closeChar, cursorOffSet) {
    // cursorOffSet can be used to move cursor relative to the closing character(s) update.
    cursorOffSet = cursorOffSet || 1
    let selectionStart = this.elTextarea.selectionStart
    let selectionEnd = this.elTextarea.selectionEnd
    let newCode = `${this.code.substring(0, selectionStart)}${closeChar}${this.code.substring(selectionEnd)}`

    this.updateCode(newCode);
    this.elTextarea.selectionEnd = selectionEnd

    if (cursorOffSet > 1) {
      // Update cursor position once code is update. setTimeout is used since `updateCode` runs after 1ms
      setTimeout(() => {
        this.elTextarea.selectionEnd = this.elTextarea.selectionStart = this.code.substring(0, selectionStart).length + cursorOffSet
      }, 2);
    }
  }

  updateCode(newCode) {
    this.code = newCode;
    this.elTextarea.value = newCode;
    this.elCode.innerHTML = escape_html(newCode);
    this.highlight();
    setTimeout(this.runUpdate, 1);
  }

  updateLanguage(newLanguage) {
    const oldLanguage = this.opts.language;
    this.elCode.classList.remove(`language-${oldLanguage}`);
    this.elCode.classList.add(`language-${newLanguage}`);
    this.opts.language = newLanguage;
    this.highlight();
  }

  addLanguage(name, options) {
    Prism.languages[name] = options;
  }

  populateDefault() {
    this.updateCode(this.code);
  }

  highlight() {
    Prism.highlightElement(this.elCode, false);
  }

  onUpdate(callback) {
    if (callback && {}.toString.call(callback) !== '[object Function]') {
      throw Error('CodeFlask expects callback of type Function');
      return;
    }

    this.updateCallBack = callback;
  }

  getCode() {
    return this.code;
  }

  runUpdate() {
    if (this.updateCallBack) {
      this.updateCallBack(this.code);
    }
  }
}
