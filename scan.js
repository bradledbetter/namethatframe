const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const { pick } = require('lodash');
const fuzzy = require('fuzzy');
const chalk = require('chalk');
const clear = require('clear');
const figlet = require('figlet');
const inquirer = require('inquirer');
const open = require('open');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
const cconsole = require('./color-console');
const { titleCase, isFilenameOK } = require('./common');
const tmdb = require('./moviedb-api');

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


// app-defined error codes
const ERROR_CODES = {
  UNKNOWN_ERROR: 1,
  UNCAUGHT_ERROR: 2,
  FAILED_READING_MOVIES_JSON: 3,
  STILLS_DIR_DOESNT_EXIST: 4,
  UNABLE_TO_WRITE_MOVIE_DB: 5,
};

const BACKUP_FILENAME = 'movies.bak.json';

/**
 * A custom exception thrown when the user decides to quit while editing. Allows saving mid-edit.
 * @param {MovieEntry[]} movieList
 */
function QuitException(movieList) {
  this.movieList = movieList.slice();
  this.name = 'MovieException';
  this.message = 'The user decided to quit.'
}


/**
 * Remove duplicates from an array of strings, ignores non images and system files, convert to full path
 * @param {string[]} fileList
 */
function cleanUpFileList(fileList) {
  return fileList
    .reduce((ra, filename) => { return ra.includes(filename) ? ra : ra.concat(filename); }, []) // remove duplicates
    .map((filename) => isFilenameOK(filename) ? path.join('.', 'stills', filename) : false) // make sure the filename is acceptable
    .filter((item) => item); // filter out empties
}

/**
 * Read in the movies.json file and parse it into an object from JSON
 * Movie DB should have this format:
 * {
 *  "lastScan": <unix timestamp>,
 *  "files": MovieEntry[]
 * }
 * TODO: schema verification for movieDB
 * @returns {Promise}
 */
async function getMovieJSON() {
  cconsole.log('Reading movies.json');
  return fs.readFileAsync(`movies.json`)
    .then((buffer) => buffer.toString())
    .then((jsonStr) => {
      cconsole.log('movies.json read');
      return JSON.parse(jsonStr)
    })
    .catch((err) => {
      cconsole.error('Error reading movies.json: ', err);
      process.exit(ERROR_CODES.FAILED_READING_MOVIES_JSON);
    });
}

/**
 * Create a map of file path to index into movieDB.movies
 * @returns {Promise<Map<string, number>>}
 */
function mapFilenames(movieDB) {
  cconsole.log('mapping movie db filenames');
  const fileMap = movieDB.movies.reduce((theMap, file, idx) => {
    theMap.set(file.filePath, idx);
    return theMap;
  }, new Map());
  cconsole.log('mapped filenames');
  return fileMap;
}

/**
 * Get a list of the files in the stills directory
 * @returns {Promise<string[]>}
 */
async function getFileList() {
  cconsole.log('scanning image files in ./stills');
  const stillsDir = path.join('.', 'stills');
  return fs.statAsync(stillsDir)
    .catch((err) => {
      cconsole.error(`Could not stat ${stillsDir}\n`, err);
      process.exit(ERROR_CODES.STILLS_DIR_DOESNT_EXIST);
    })
    .then(() => fs.readdirAsync(stillsDir))
    .then((filenames) => {
      cconsole.log('got files, cleaning up names');
      return cleanUpFileList(filenames)
    })
    .then((cleanList) => {
      cconsole.log('filenames cleaned up');
      return cleanList;
    });
}

/**
 * Remove any filePaths that are in the movieDB that were not found in our scan of the stills directory.
 * @param {MovieDB} movieDB
 * @param {string[]} fileList
 * @returns {MovieEntry[]}
 */
function removeDeletedFilesFromDB(movieDB, fileList) {
  cconsole.log('Removing deleted/missing files from movies DB');
  return movieDB.movies.reduce((movies, cur) => {
    if (fileList.includes(cur.filePath)) {
      movies.push(cur);
    }
    return movies;
  }, []);
}

/**
 * Pseudo constructor for a MovieEntry
 * @param {string} filePath the path to the image file
 * @param {string?} movieTitle defaults to empty string, e.g. for new files
 * @param {string?} movieYear 4 digits. Defaults to empty string
 * @throws if filePath is empty, does not stat, or is not an image
 * @returns {MovieEntry}
 */
function makeMovieEntry(filePath, movieTitle = '', movieYear = '') {
  if (!filePath) {
    throw new Error('makeMovieEntry: filePath was empty');
  }

  // statSync throws an error if there's a problem (e.g.) ENOENT, file doesn't exist.
  try {
    fs.statSync(filePath);
  } catch (ex) {
    throw new Error(`makeMovieEntry: ${ex.message}`);
  }

  const pathDeets = path.parse(filePath);
  if (!isFilenameOK(pathDeets.base)) {
    throw new Error(`makeMovieEntry: "${pathDeets.base}" is not a filename we like`);
  }

  return {
    filePath,
    movieTitle,
    movieYear,
  };
}

/**
 * Add any still image files into movie db that aren't already in there
 * @param {MovieDB} movieDB the movies we already know about
 * @param {string[]} fileList list of files in our stills folder
 * @returns {MovieEntry[]}
 */
function addNewFilesToDB(movieDB, fileList) {
  cconsole.log('Adding new files to movies DB');
  const filesWeKnow = movieDB.movies.map((movie) => movie.filePath);
  const newMovies = [];
  fileList.forEach((filePath) => {
    if (!filesWeKnow.includes(filePath)) {
      try {
        newMovies.push(makeMovieEntry(filePath));
      } catch (ex) {
        cconsole.error(ex.message);
      }
    }
  });
  return movieDB.movies.concat(newMovies);
}

/**
 * Parse a filename and guess what the movie title and year should be.
 * @param {MovieEntry} movie
 * @returns {MovieEntry} a new entry with the title and year filled in
 */
function guessDetailsFromFilename(movie) {
  /*
  Typically, we'd want a filename formatted something like this:
  <title><separator+><four digit year><separator?>.<jpg|png|gif|jpeg>
  The separator can become tricky. It could be something like [\s\-\(]+|\b or any number of things I haven't thought of.
  It also gets complicated in that some movie titles contain numbers (3:10 to Yuma, Another 48 hours, 9...) that can trip up parsing
  It may make more sense to parse from the end of the filename and try to pick out the year.
  Then you'd try to pick out the title from the beginning, excluding what you pulled out for the year.
  If the filename is <= 5 characters, you'd just return that as the title and ignore the year.
  */
  const returnMovie = { ...movie };
  const parsed = path.parse(movie.filePath);
  let matches = parsed.name.match(/[\s\-\(\b]?(\d{4})[\s\-\)\b]?$/); // note: questioning that ? after the separator
  if (matches !== null) {
    returnMovie.movieYear = matches[ 1 ];
    returnMovie.movieTitle = parsed.name.slice(0, 0 - matches[ 0 ].length).trim();
  } else {
    returnMovie.movieTitle = parsed.name;
  }

  matches = returnMovie.movieTitle.match(/([^\(]+)/);
  if (matches !== null) {
    returnMovie.movieTitle = titleCase(matches[ 1 ].trim());
  }

  return returnMovie;
}

/**
 * Loop over movie list, prompting for the user to fill in the details.
 * @param {MovieEntry[]} movies
 * @returns {MovieEntry[]}
 */
async function fillInMovieDetails(movies) {
  const newMovies = [];

  const len = movies.length;
  for (let i = 0; i < len; i++) {
    const guess = guessDetailsFromFilename(movies[ i ]);
    try {
      newMovies.push(await askIfChangesNeeded(guess));
    } catch (ex) {
      if (ex instanceof QuitException) {
        throw new QuitException(newMovies.concat(ex.movieList));
      }
    }
    writeToBackupFile(newMovies);
  }

  return newMovies;
}

/**
 * Display file details to user, ask if they want to make changes.
 * If yes, pass along to prompting per field changes.
 * If no, move to next file.
 * @param {MovieEntry} movie
 */
async function askIfChangesNeeded(movie) {
  clearScreen();
  cconsole.log(`* File path: ${movie.filePath}`);
  cconsole.log(`* Title: ${movie.movieTitle}`);
  cconsole.log(`* Year: ${movie.movieYear}`);
  const answer = await inquirer.prompt([
    {
      type: 'expand',
      name: 'editFile',
      message: 'Would you like to change this?',
      default: 0,
      choices: [
        {
          name: 'Yes',
          value: 'yes',
          key: 'y',
        },
        {
          name: 'No',
          value: 'no',
          key: 'n',
        },
        {
          name: 'Ask TMDB',
          value: 'tmdb',
          key: 'a',
        },
        {
          name: 'Quit',
          value: 'quit',
          key: 'q',
        }
      ]
    }
  ]);

  switch (answer.editFile) {
    case 'yes':
      return await promptFileChanges(movie);
    case 'tmdb':
      return await askTMDB(movie);
    case 'no':
      return movie;
    case 'quit':
      throw new QuitException([ movie ]);
  }
}

async function askTMDB(movie) {
  let movieSearch;
  try {
    movieSearch = await tmdb.searchMovie(movie.movieTitle.toLocaleLowerCase());
  } catch (ex) {
    cconsole.error(ex.message);
    hardExit();
  }

  if (movieSearch.length === 0) {
    // todo askIfChangesNeeded calls clear(), so our message gets eaten
    cconsole.info('No matches found', 'yellow');
    return await askIfChangesNeeded(movie);
  }

  let answer;

  do {
    const choices = [
      {
        name: 'Open still in browser',
        value: 'open',
      },
      {
        name: 'Cancel',
        value: 'cancel',
      },
      new inquirer.Separator(),
    ]
      .concat(movieSearch.map((movie, idx) => {
          return {
            name: `${movie.movieTitle} - ${movie.movieYear}`,
            value: idx,
          };
        }));

    answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'accept',
        message: 'Which would you like to use?',
        default: 0,
        choices,
        pageSize: 12,
      }
    ]);

    if (answer.accept === 'open') {
      open(path.join('.', movie.filePath))
    }
  } while (answer.accept === 'open');

  if (answer.accept === 'cancel') {
    return await askIfChangesNeeded(movie);
  }

  const { movieTitle, movieYear } = pick(movieSearch[ answer.accept ], [ 'movieTitle', 'movieYear' ]);
  return Object.assign({}, movie, { movieTitle, movieYear });
}

/**
 * Autocomplete search by filename for which entries to edit, then prompt for changes on selected.
 * @param {MovieEntry[]} movies
 * @returns {MovieEntry[]}
 */
async function searchForFileChanges(movies) {
  // Autocomplete search by filename for which entries to edit, then prompt for changes on selected.
  // after each edit, ask to continue. If y, go back to search. If n, return updated list.
  const newMovies = movies.slice();
  const fileMap = mapFilenames({ movies });
  const files = fileMap.keys();

  do {
    clearScreen();
    let answer = await inquirer.prompt([
      {
        type: 'autocomplete',
        message: 'Search for a file to add details for: ',
        name: 'file',
        suggestOnly: true,
        pageSize: 10,
        source: (answersSoFar, input) => {
          if (!input) {
            return files;
          }
          const result = fuzzy.filter(input, files);
          return result.map((item) => item.original);
        }
      }
    ]);

    if (answer && answer.file) {
      const idx = fileMap.get(answer.file);
      if (idx >= 0) {
        newMovies[ idx ] = await promptFileChanges(movies[ idx ]);
        writeToBackupFile(newMovies);
      }
    }
  } while (await promptContinue());

  return newMovies;
}

/**
 * A simple function to ask the user if they want to continue.
 * In its own function for consistency.
 * @returns {boolean}
 */
async function promptContinue() {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continue',
      message: 'Would you like to continue?',
      default: true,
    }
  ]);
  return answer && answer.continue;
}

/**
 * Show fields, allow user to make changes, save results
 */
async function promptFileChanges(movie) {
  // prompt based on what was passed in
  const newFields = await inquirer.prompt([
    {
      type: 'input',
      name: 'movieTitle',
      message: 'Movie title: ',
      default: movie.movieTitle
    },
    {
      type: 'input',
      name: 'movieYear',
      message: 'Movie year: ',
      default: movie.movieYear
    }
  ]);

  const { movieTitle, movieYear } = pick(newFields, [ 'movieTitle', 'movieYear' ]);
  return Object.assign({}, movie, { movieTitle, movieYear });
}

/**
 * Merge updated movies in with existing movie list
 * @param {MovieEntry[]} newMovies
 * @param {MovieEntry[]} oldMovies
 * @returns {MovieEntry[]}
 */
function mergeUpdates(newMovies, oldMovies) {
  return oldMovies.reduce((movies, movie) => {
    const newMovie = newMovies.find((nm) => nm.filePath === movie.filePath);
    if (newMovie) {
      movies.push(newMovie);
    } else {
      movies.push(movie);
    }
    return movies;
  }, []);
}

/**
 * Write movieDB to file
 * @param {MovieDB} movieDB
 * @param {string} filePath defaults to movies.json
 * @returns {Promise<MovieDB>}
 */
async function writeMovieDB(movieDB, filePath = 'movies.json') {
  cconsole.log('Saving movies.json');
  movieDB.lastScan = Date.now();
  return fs.writeFileAsync(filePath, JSON.stringify(movieDB, null, 2))
    .then(() => {
      cconsole.log('Saved movies.json');
      return movieDB;
    })
    .catch((err) => {
      cconsole.error('Error writing movies.json: \n', err);
      process.exit(ERROR_CODES.UNABLE_TO_WRITE_MOVIE_DB);
    });
}

/**
 * Clear the screen, print the fancy ascii art
 */
function clearScreen() {
  clear();
  cconsole.log(
    chalk.green(
      figlet.textSync('NtF DB Generator', { horizontalLayout: 'standard' })
    )
  );
}

/**
 * Write data to the backup file.
 * @param {MovieEntry[]} movies
 */
function writeToBackupFile(movies) {
  fs.writeFileSync('movies.bak.json', JSON.stringify(movies, null, 2));
}

//*\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//

async function main() {
  try {
    clearScreen();

    // read in movies.json
    const movieDB = await getMovieJSON();

    // scan stills directory for files
    const fileList = await getFileList();

    // remove entries in db that don't exist in file list
    movieDB.movies = removeDeletedFilesFromDB(movieDB, fileList);

    // Find any new files that don't exist in db
    movieDB.movies = addNewFilesToDB(movieDB, fileList);

    // make a handy map of filename to DB index
    const fileMap = mapFilenames(movieDB);

    // find if there are any movies with details filled in
    const oldMovies = movieDB.movies.filter((movie) => movie.movieTitle && movie.movieYear);
    if (oldMovies.length > 0) {
      // prompt the user if they want to edit old files
      let answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'editOldFiles',
          message: 'Would you like to update existing entries?',
        }
      ]);

      if (answer.editOldFiles) {
        cconsole.log('Editing old entries...');

        answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'editOption',
            message: 'Do you want to search for a filename or go through the list?',
            default: 'search',
            choices: [
              {
                name: 'Search',
                value: 'search',
              },
              {
                name: 'List',
                value: 'list',
              }
            ]
          }
        ]);

        let updated = movieDB.movies;
        switch (answer.editOption) {
          case 'list':
            try {
              updated = await fillInMovieDetails(oldMovies);
            } catch (ex) {
              if (ex instanceof QuitException) {
                movieDB.movies = mergeUpdates(ex.movieList, oldMovies);
                await writeMovieDB(movieDB);
                hardExit();
              }
            }
            break;
          default: // search
            try {
              updated = await searchForFileChanges(oldMovies, fileMap);
            } catch (ex) {
              if (ex instanceof QuitException) {
                movieDB.movies = mergeUpdates(ex.movieList, oldMovies);
                await writeMovieDB(movieDB);
                hardExit();
              }
            }
            break;
        }
        movieDB.movies = mergeUpdates(updated, oldMovies);
        await writeMovieDB(movieDB);
      } else {
        cconsole.log('Not editing old entries');
      }
    } else {
      cconsole.log('No existing entries to update, moving on.');
    }

    // backup
    writeToBackupFile(movieDB.movies);

    // prompt for details on incomplete entries
    cconsole.log('Now to fill in details for new movies.');

    const newMovies = movieDB.movies.filter((movie) => !movie.movieTitle || !movie.movieYear);
    try {
      const updated = await fillInMovieDetails(newMovies);
      movieDB.movies = mergeUpdates(updated, movieDB.movies);
    } catch (ex) {
      if (ex instanceof QuitException) {
        movieDB.movies = mergeUpdates(ex.movieList, movieDB.movies);
        await writeMovieDB(movieDB);
        hardExit();
      }
    }

    // write movie db
    cconsole.log('Movies updated. Writing database');
    await writeMovieDB(movieDB);

    // done
    return Promise.resolve(1);
  } catch (err) {
    return Promise.reject(err);
  }
}

// windows workaround for not having SIGINT
if (process.platform === "win32") {
  var rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function() {
    process.emit("SIGINT");
  });
}

// write backup file on shutdown
function hardExit() {
  cconsole.info(`Exiting. A backup movie db is at ${BACKUP_FILENAME}`);
  process.exit();
}
process.on("SIGINT", hardExit);

main()
  .then(() => {
    cconsole.info('\nProcessing complete\n', 'green');
    process.exit(0);
  })
  .catch((err) => {
    cconsole.error(`Some error occurred. A backup movie db is at ${BACKUP_FILENAME}`);
    cconsole.error(err.stack)
    process.exit(ERROR_CODES.UNCAUGHT_ERROR);
  });
