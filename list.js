const fs = require('fs');
const path = require('path');
const moment = require('moment');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');
const MAX_IMAGE_WIDTH_PX = 958;
const MAX_IMAGE_HEIGHT_PX = 540;
let delta = 0;
const todayStamp = moment().format('YYYY-MM-DD');

/**
 * Write the movie names and slide list files
 * @param {string} category game category
 * @param {string} movieNames text for movie name file
 * @param {string} slideList text for slidelist file
 * @param {function(Array<string>)} callback call this when done so we can make a pptx
 */
function writeSlideTextFiles(category, movieNames, slideList, callback) {
    // write the movie name file
    fs.writeFile(path.join('.', category, `movie-names-${todayStamp}.txt`), movieNames, (err) => {
        if (err) {
            console.error(err);
            process.exit();
        }

        fs.writeFile(path.join('.', category, `slide-list-${todayStamp}.txt`), slideList, (err) => {
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
 * Remove duplicates from an array of strings
 * @param {Array<string>} items
 */
function removeDuplicates(items) {
    let returnItems = [];
    items.forEach((item) => {
        if (!returnItems.includes(item)) {
            returnItems.push(item);
        }
    });
    return returnItems;
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
        // only include image files
        if (filename.match(/\.(png|jpg|gif)$/) !== null) {
            let line = filename.substr(0, filename.lastIndexOf('.'));
            line = titleCase(line);
            lines.push(line + '\n');
        }
    });

    // sort alphabetically
    lines.sort();

    return lines;
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
            // ignore certain directories, and hidden folders
            if (!ignoreDirs.includes(dirItem) && dirItem.match(/^\./) === null) {
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

/**
 * Write out a pptx slideshow
 * @param {string} category slide folder name
 * @param {Array<string>} slides random order list of slides
 * @param {Function} fileResolve resolve when the file is written
 * @param {Function} fileReject reject if there's an error
 */
function writePptx(category, slides, fileResolve, fileReject) {
    // create a pptx
    const pptx = new PptxGenJs();
    pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px
    pptx.defineSlideMaster({
        title: 'MAIN',
        bkgd: '000000',
        slideNumber: {
            x: '90%', y: '90%',
            fontFace: 'Courier',
            fontSize: 16,
            color: 'FFFFFF'
        }
    });


    const allSlidePromises = [];
    slides.forEach((slideFilename, slideIndex) => {
        if (slideFilename.match(/\.(png|jpg|gif)$/) !== null) {
            allSlidePromises.push(new Promise((resolve, reject) => {
                try {
                    const slidePath = path.join('.', category, slideFilename);
                    console.log(`${slideIndex}: ${slidePath}`);
                    const slide = pptx.addNewSlide('MAIN');
                    // slide.back = '000000';
                    // slide.color = 'FFFFFF';
                    // slide.slideNumber({
                    // x: '90%', y: '90%',
                    // fontFace: 'Courier',
                    // fontSize: 16,
                    // color: 'FFFFFF'
                    // });

                    // get image size synchronously. Probably slow, but easy to code.
                    const image = sharp(slidePath);
                    image.metadata((err, imgData) => {
                        if (err) {
                            console.error(err);
                            process.exit();
                        }

                        // NOTE: we need to include the original width and height for the aspect ratio to be maintained
                        slide.addImage({
                            path: slidePath,
                            x: 0,
                            y: 0,
                            w: imgData.width / 72,
                            h: imgData.height / 72,
                            sizing: {
                                type: 'contain',
                                w: MAX_IMAGE_WIDTH_PX / 72,
                                h: MAX_IMAGE_HEIGHT_PX / 72
                            }
                        });
                        resolve(slideFilename);
                    });
                } catch (ex) {
                    reject(ex);
                }
            }));
        }
    });

    // wait to save until all are done.
    Promise.all(allSlidePromises).then(() => {
        // save the pptx
        pptx.save(path.join('.', category, `name-that-frame-${todayStamp}.pptx`), (filename) => {
            fileResolve(filename);
        });
    }, (err) => {
        fileReject(err);
    });
}

/**
 * Numbers items in an array and joins with \n
 * @param {[string]} slides
 * @return {String}
 */
function numberAndJoin(slides) {
    const retArray = [];
    slides.forEach((item, index) => {
        retArray.push(`${index + 1}. ${item}`);
    });
    return retArray.join('\n');
}

// let's do this
getDirectories((directories) => {
    let writeCount = 0;
    const allFilePromises = [];
    directories.forEach((category) => {
        allFilePromises.push(new Promise((fileResolve, fileReject) => {
            fs.readdir(path.join('.', category), (err, filenames) => {
                if (err) {
                    fileReject(err);
                }

                const deDuped = removeDuplicates(filenames);
                let shuffled = fyShuffle(deDuped); // shuffle the array for slide output
                shuffled = shuffled.slice(0, 100); // take the top 100
                const output = filterFilenames(shuffled); // clean up the names for bingo cards
                writeSlideTextFiles(category, output.join('\n'), numberAndJoin(shuffled),
                    writePptx.call(writePptx, category, shuffled, fileResolve, fileReject));
            });
        }));
    });

    // log a message when the file writes have been called
    // it seems we can wait for the program to exit on its own when all the disk operations are done..?
    Promise.all(allFilePromises).then(() => {
        console.log('Finishing up file writing, then exiting...');
    }, (err) => {
        console.error(err);
        process.exit(1);
    })
});
