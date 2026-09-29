// Entry point for blocks/vendor/blockly.js, the single-file Blockly build
// the block editor imports. Regenerate with `npm run build:blockly` after
// upgrading the blockly package in package.json. Only Blockly's core and
// its English messages are used: the page defines all of its own blocks,
// so Blockly's library of standard blocks is not bundled.
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';

Blockly.setLocale(En);

export * from 'blockly/core';
