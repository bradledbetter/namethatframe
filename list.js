const fs = require('fs');
const path = require('path');

/**
 * Write the movie names and slide list files
 * @param {string} category game category
 * @param {string} movieNames text for movie name file
 * @param {string} slideList text for slidelist file
 * @param {function(Array<string>)} callback call this when done so we can make a pptx
 */
function writeSlideTextFiles(category, movieNames, slideList, callback) {
    // write the movie name file
    fs.writeFile(path.join('.', category, 'movie-names.txt'), movieNames, (err) => {
        if (err) {
            console.error(err);
            process.exit();
        }
        fs.close(category, () => {});

        fs.writeFile(path.join('.', category, 'slide-list.txt'), slideList, (err) => {
            if (err) {
                console.error(err);
                process.exit();
            }

            if (callback && typeof callback === 'function') {
                callback(slideList);
            }
        });
    });
}

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
 * Clean up individual filenames and eliminate duplicates
 * @param {Array} filenames
 * @return {Array}
 */
function filterFilenames(filenames) {
    // format the names
    let lines = [];
    filenames.forEach((filename) => {
        if (!['.', '..'].includes(filename)) {
            let line = filename.substr(0, filename.lastIndexOf('.'));
            line = titleCase(line);
            lines.push(line + '\n');
        }
    });

    // remove duplicates
    let movieNames = [];
    lines.forEach((line) => {
        if (!movieNames.includes(line)) {
            movieNames.push(line);
        }
    });

    // sort alphabetically
    movieNames.sort();

    return movieNames;
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
        temporaryValue = iArray[currentIndex];
        iArray[currentIndex] = iArray[randomIndex];
        iArray[randomIndex] = temporaryValue;
    }

    return iArray;
}

/**
 * Get a list of the directories in this directory.
 * The assumption being that the only thing in those directories are movie stills
 * @param {function(Array<string>)} callback function to call with directory names
 */
function getDirectories(callback) {
    fs.readdir('.', (err, dirItems) => {
        if (err) {
            console.log(err);
            process.exit();
        }

        const ignoreDirs = ['.', '..', 'node_modules'];
        const directories = [];
        dirItems.forEach((dirItem) => {
            if (!ignoreDirs.includes(dirItem)) {
                const stats = fs.statSync(dirItem);
                if (stats.isDirectory()) {
                    directories.push(dirItem);
                }
            }
        });

        if (callback && typeof callback === 'function') {
            callback(directories);
        }
    });
}

// let's do this
getDirectories((directories) => {
    directories.forEach((category) => {
        fs.readdir(path.join('.', category), (err, filenames) => {
            if (err) {
                fs.close(fd, () => {
                    process.exit();
                });
            }

            const output = filterFilenames(filenames);
            const shuffled = fyShuffle(output);// shuffle the array for slide output
            writeSlideTextFiles(category, output.join(''), shuffled.join(''), (slideList) => {
                // TODO: create a pptx
            });
        });
    });
});
