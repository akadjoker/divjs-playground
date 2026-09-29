// Entry point for blocks/vendor/blockly.js, the single-file Blockly build
// the block editor imports. Regenerate with `npm run build:blockly` after
// upgrading the blockly package in package.json. Only Blockly's core and
// its messages in the page's languages are used: the page defines all of
// its own blocks, so Blockly's library of standard blocks is not bundled.
// The messages are Blockly's own translations: English, and Portuguese
// from Portugal ("pt", not "pt-br"). The page switches between them with
// Blockly.setLocale(MESSAGES[language]).
import * as Blockly from 'blockly/core';
import En from 'blockly/msg/en';
import Pt from 'blockly/msg/pt';

Blockly.setLocale(En);

export const MESSAGES = { en: En, pt: Pt };

export * from 'blockly/core';
