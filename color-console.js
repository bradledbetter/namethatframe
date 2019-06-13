const CONSOLE_COLORS = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
  * Verify that we are using a console color we know about. Otherwise make it white.
  * @param {string} color shorthand color, not the code. e.g. red, white, blue...
  * @returns
  */
function getColorCode(color) {
  if (!color || !Object.keys(CONSOLE_COLORS).includes(color)) {
    return CONSOLE_COLORS.white;
  }
  return CONSOLE_COLORS[ color ];
}

/**
 * Utility to output error messages in red (by default)
 * @param {string} message
 * @param {string?} color default is 'red', but can be other
 */
function error(message, color = 'red') {
  const colorCode = getColorCode(color);
  console.error(`${colorCode}${message}${CONSOLE_COLORS.reset}`);
}

/**
 * Utility to output info messages in yellow (by default)
 * @param {string} message
 * @param {string?} color default is 'yellow', but can be other
 */
function info(message, color = 'yellow') {
  const colorCode = getColorCode(color);
  console.info(`${colorCode}${message}${CONSOLE_COLORS.reset}`);
}

/**
 * Same as (@see info)
 */
function warn(message, color = 'yellow') {
  info(message, color);
}

/**
 * Utility to output log messages in white (by default)
 * @param {string} message
 * @param {string?} color default is 'white', but can be other
 */
function log(message, color = 'white') {
  const colorCode = getColorCode(color);
  console.log(`${colorCode}${message}${CONSOLE_COLORS.reset}`);
}

module.exports = {
  CONSOLE_COLORS,
  error,
  info,
  warn,
  log,
};
