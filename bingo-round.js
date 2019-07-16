const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const inquirer = require('inquirer');
const { fyShuffle } = require('./common');
const { writeSlideCallSheet, writeSlideshowPptx } = require('./slideshow');
const { makeCards } = require('./card-pdf');

const gameLength = 80; // just picking a number. Research indicates the average bingo game is something like 70 calls.

/**
 * An entry in the movie db
 * @typedef {Object<string, string>} MovieEntry
 * @property {string} filePath Path to the still image
 * @property {string} movieTitle Title of the movie the still is from
 * @property {string} movieYear The 4 digit year the movie was released
 */
/**
 * Object that holds list of movies we know about
 * @typedef {Object<string, any>} MovieDB
 * @property {number} lastScan Timestamp of the last time the db was written
 * @property {MovieEntry[]} movies Entries for the movies in the db
 */

// for testing makeCards
function cardTest() {
  const options = (new Array(200))
    .fill(1)
    .map(() => Math.trunc(Math.random() * 1000).toString());
  const doc = makeCards(2, options);
  doc.pipe(fs.createWriteStream('test-output.pdf'));
  doc.end();
}

/**
 * Read in the movie db and format the movies in a way that's useful to us.
 * It removes ones that are missing title or year.
 * It reduces the array to a Map of "title (year)" to an array of still file paths.
 * @returns {Map<string, string[]>}
 */
function readMovieDB() {
  const filePath = path.join('.', 'movies.json');
  const movieDB = JSON.parse(fs.readFileSync(filePath));
  return movieDB.movies
    .filter((movie) => movie.movieTitle && movie.movieYear) // get rid of ones missing details
    .reduce((m, movie) => {
      const title = `${movie.movieTitle} (${movie.movieYear})`;
      const stills = m.get(title) || [];
      stills.push(movie.filePath);
      m.set(title, stills);
      return m;
    }, new Map());
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

/**
 * Iterate over a Map(movieTitle, movieStills) to find ones that have more than one still and pick one randomly.
 */
function dedupeRandom(movieMap) {
  movieMap.forEach((stills, name) => {
    if ( stills.length > 1) {
      movieMap.set(name, stills[getRandomInt(stills.length)]);
    } else {
      movieMap.set(name, stills[0]);
    }
  });
  return movieMap;
}

/**
 * Iterate over a Map(movieTitle, movieStills) to find ones that have more than one still and pick one.
 */
function removeDuplicates(movieMap) {
  // todo perhaps in the future I'll extend this to allow the user to choose one somehow
  return dedupeRandom(movieMap);
}

/**
 * main function
 */
async function main() {
  let args = [];
  if (process.argv.length > 2) {
    args = process.argv.slice(2);
  }

  if (args.includes('-t')) {
    cardTest();
    process.exit();
  }

  const movieMap = readMovieDB();
  movieMap = removeDuplicates(movieMap);

  // Get movie names and shuffle them, then pick the top 80.
  const names = movieMap.keys();
  const shuffledNames = fyShuffle(names).slice(0, gameLength);

  // save the call list
  const callSheetName = await writeSlideCallSheet(shuffledNames);

  // save the powerpoint
  const slides = shuffledNames.map((name) = movieMap.get(name));
  await writeSlideshowPptx(slides);

  // make cards
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'numCards',
      message: 'How many cards should I generate? Minimum 2: ',
      validate: (input) => {
        const num = +input;
        if (num < 2) {
          return 'Please enter a number greater than or equal to 2.';
        }
        return true;
      }
    },
  ]);

  const cardCount = +answer.numCards;

  // pass args to makeCards
  makeCards(cardCount, shuffledNames, true);

  // todo: ask to open card pdf, slide call sheet for printing
}

main();
