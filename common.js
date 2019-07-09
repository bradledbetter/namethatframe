
/**
 * Turns a word (a string of alphabetic characters) into a first letter capitalized, others lowercase word.
 * @param {string} word
 * @returns {string}
 */
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
}

/**
 * Convert a string to title case. Tacitly assumes a space separated list of words.
 * @param {string} txt
 * @return {string}
 */
function titleCase(txt) {
  if (0) { // v1
    // Old simplistic version. Capitalizes all words separated by whitespace. Also converts _ to '
    let retString = txt.replace(/\w\S*/g, function(txt) {
      return capitalize(txt);
    });
    return retString.replace(/_/g, "'"); // eslint-disable-line
  } else { // v2
    // Split by whitespace, capitalize words > 3 characters long (unless the short word is first), convert _ to ', join with ' '
    const title = txt.replace(/_/g, "'").replace(/[\(\)\[\]]+/g, '');
    const tokens = title.split(/\s+/);
    return tokens.reduce((acc, word, idx) => {
      if (idx > 0 && word.length < 4) {
        acc.push(word);
      } else {
        acc.push(capitalize(word));
      }
      return acc;
    }, []).join(' ');

  }
}

/**
 * Check whether this is a valid slide filename
 * @param {string} filename
 * @returns {boolean}
 */
function isFilenameOK(filename) {
  return filename.match(/\.(png|jpg|gif)$/) !== null && filename[ 0 ] !== '.';
}

/**
 * Fisher-Yates Shuffle an array in place.
 * @param {Array} iArray
 * @return {Array}
 */
function fyShuffle(iArray) {
  let currentIndex = iArray.length;
  let temporaryValue;
  let randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = iArray[ currentIndex ];
    iArray[ currentIndex ] = iArray[ randomIndex ];
    iArray[ randomIndex ] = temporaryValue;
  }

  return iArray;
}

module.exports = {
  capitalize,
  titleCase,
  isFilenameOK,
  fyShuffle,
};
