/**
 * Convert a string to title case
 * @param {string} txt
 * @return {string}
 */
function titleCase(txt) {
  let retString = txt.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
  return retString.replace(/_/g, "'"); // eslint-disable-line
}

/**
 * Check whether this is a valid slide filename
 * @param {string} filename
 * @returns {boolean}
 */
function isFilenameOK(filename) {
  return filename.match(/\.(png|jpg|gif)$/) !== null && filename[ 0 ] !== '.';
}

module.exports = {
  titleCase,
  isFilenameOK
}
