const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const moment = require('moment');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');
const MAX_IMAGE_WIDTH_PX = 958;
const MAX_IMAGE_HEIGHT_PX = 540;
const todayStamp = moment().format('YYYY-MM-DD');

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

/**
 * Remove duplicates from an array of strings, ignores non images and system files
 * @param {string[]} fileList
 */
function cleanUpFileList(fileList) {
    return fileList
        .reduce((ra, filename) => { return ra.includes(filename) ? ra : ra.concat(filename); }, []) // remove duplicates
        .map(filename => isFilenameOK(filename) ? filename : false) // make sure the filename is acceptable
        .filter(item => item); // filter out empties
}

/**
 * Cut the first len items off of an array and return it
 * @param {array} ra
 * @param {number} len
 */
function limitArrayTo(ra, len) {
    return ra.slice(0, len);
}

/**
 * Turn "movie name.jpg" to "Movie Name"
 * @param {string} filename
 * @returns {string}
 */
function filenameToMovie(filename) {
    let newName = filename.substr(0, filename.lastIndexOf('.'));
    newName = titleCase(newName);
    return newName
        .replace(/[\(\)]/g, ' - ')
        .replace(/_/g, '');
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

/**
 * Get a list of the directories in this directory.
 * The assumption being that the only thing in those directories are movie stills
 * @param {Promis<string[]>} function to call with directory names
 */
function getDirectories() {
    return fs.readdirAsync('.')
        .then(dirItems => {
            const ignoreDirs = [ '.', '..', 'node_modules' ];
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

            return directories;
        })
        .catch(err => {
            console.error('Unable to read directory/ies: ', err);
            process.exit();
        });
}

/**
 * Write the movie names and slide list files
 * @param {string} category game category
 * @param {string} movieNames text for movie name file
 * @param {string} slideList text for slidelist file
 * @returns {Promise<Map<string, object[]>>} return the slideMap when we're done writing the file
 */
function writeSlideCallSheet(slideMap) {
    let slideList = '';
    // iterate over the map
    slideMap.forEach((slides, category) => {
        slideList += category + '\n';
        slides.forEach(slide => slideList += slide.movieName + '\n');
        slideList += '\n';
    });

    return fs.writeFileAsync(`slide-list-${todayStamp}.txt`, slideList)
        .then(() => slideMap)
        .catch(err => {
            console.error('Error writing call sheet: ', err);
            process.exit();
        });
}

/**
 * Add to pptx slideshow
 * @param {Map<string, string[]>} slideMap
 * @returns {Promise<PptxGenJs>} resolves with PptxGenJs instance
 */
function writePptx(slideMap) {
    // create a pptx
    const pptx = new PptxGenJs();
    pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px
    pptx.defineSlideMaster({
        title: 'MAIN',
        bkgd: '000000'
    });

    const allSlidePromises = [];

    let round = 1;

    // slide = {slidePath: string; movieName: string;}
    slideMap.forEach((slides, category) => {
        // add round title
        const titleSlide = pptx.addNewSlide('MAIN');
        console.log(`Round ${round}: ${category}\nPoints for title and year.`);
        titleSlide.addText(`Round ${round}: ${category}\nPoints for title and year.`, {
            x: 0,
            y: 0,
            w: '100%',
            h: '100%',
            autofit: false,
            align: 'center',
            valign: 'middle',
            fontFace: 'Arial',
            fontSize: 60,
            color: 'ffffff',
            isTextBox: true
        });
        round++;

        slides.forEach((slideData, slideIndex) => {
            console.log(`${category}, ${slideIndex}: ${slideData.slidePath}`);
            const slide = pptx.addNewSlide('MAIN');

            // get image size synchronously. Probably slow, but easy to code.
            // TODO: promisify that metadata call?
            const image = sharp(slideData.slidePath);
            allSlidePromises.push(image.metadata()
                .then(imgData => {
                    // NOTE: we need to include the original width and height for the aspect ratio to be maintained
                    slide.addImage({
                        path: path.join('.', slideData.slidePath),
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
                })
                .catch(err => {
                    console.error(err);
                    process.exit(1);
                }));
        });

        // add spacer
        pptx.addNewSlide('MAIN');
    });

    return Promise.all(allSlidePromises)
        .then(() => pptx);
}

// let's do this
getDirectories()
    .then(directories => {
        const slideListPromises = [];
        directories.forEach(category => {
            slideListPromises.push(
                fs.readdirAsync(path.join('.', category))
                    .then(filenames => {
                        const deDuped = cleanUpFileList(filenames);
                        // generate the full file path and human readable name for slide, and have that object be the 'slide'
                        const slideList = limitArrayTo(deDuped.map(file => ({
                            slidePath: path.join('.', category, file),
                            movieName: filenameToMovie(file)
                        })), 15);
                        return [ category, fyShuffle(slideList) ];
                    }))
        });
        return Promise.all(slideListPromises);
    })
    .catch(err => {
        console.error('Error reading filenames: ', err);
        process.exit(1);
    })
    .then(slideListPromises => {
        const slideMap = new Map();
        fyShuffle(slideListPromises).forEach(catMap => {
            slideMap.set(catMap[ 0 ], catMap[ 1 ])
        });

        return writeSlideCallSheet(slideMap);
    })
    .then(writePptx)
    .then(pptx => {
        pptx.save(`NtF-${todayStamp}.pptx`, (filename) => {
            console.log(`Finishing up writing ${filename}, then exiting...`);
        });
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

// todo look at pdfkit for generating bingo card pdfs http://pdfkit.org/
// todo look at ways of taking a random sample of slides: https://en.wikipedia.org/wiki/Reservoir_sampling
// * I could just fyShuffle and slice()
