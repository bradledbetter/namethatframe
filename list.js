const fs = require('fs');
const path = require('path');
const moment = require('moment');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');
const MAX_IMAGE_WIDTH_PX = 958;
const MAX_IMAGE_HEIGHT_PX = 540;
const todayStamp = moment().format('YYYY-MM-DD');

/**
 * Write the movie names and slide list files
 * @param {string} category game category
 * @param {string} movieNames text for movie name file
 * @param {string} slideList text for slidelist file
 * @param {function(Array<string>)} callback call this when done so we can make a pptx
 */
function writeSlideCallSheet(slideMap, callback) {
    let slideList = '';
    // iterate over the map
    slideMap.forEach((slides, category) => {
        str += category + '\n';
        slides.forEach(slide => str += slide + '\n');
        str += '\n';
    });

    fs.writeFile(`slide-list-${todayStamp}.txt`, slideList, (err) => {
        if (err) {
            console.error(err);
            process.exit();
        }

        if (callback && typeof callback === 'function') {
            callback(slideList);
        }
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
        if (!returnItems.includes(item) && item !== 'desktop.ini') {
            returnItems.push(item);
        }
    });
    return returnItems;
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

const allSlidePromises = [];

/**
 * Add to pptx slideshow
 * @param {Map<string, string[]>} slideMap
 * @param {object} pptx PPTX instance
 */
function writePptx(slideMap, pptx) {
    slideMap.forEach((slides, category) => {
        // add round title
        const titleSlide = pptx.addNewSlide('MAIN');
        titleSlide.addText(category); // TODO:

        slides.forEach((slideFilename, slideIndex) => {
            if (slideFilename.match(/\.(png|jpg|gif)$/) !== null) {
                const slidePath = path.join('.', category, slideFilename);
                console.log(`${category}, ${slideIndex}: ${slidePath}`);
                const slide = pptx.addNewSlide('MAIN');

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
                });
            }
        });

        // add spacer
        pptx.addNewSlide('MAIN');
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
    // create a pptx
    const pptx = new PptxGenJs();
    pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px
    pptx.defineSlideMaster({
        title: 'MAIN',
        bkgd: '000000'
    });

    const allFilePromises = [];
    const slideMap = new Map();
    directories.forEach((category) => {
        allFilePromises.push(new Promise((dirResolve, dirReject) => {
            fs.readdir(path.join('.', category), (err, filenames) => {
                if (err) {
                    dirReject(err);
                }

                // set a shiffled list of slides
                const deDuped = removeDuplicates(filenames);
                let shuffled = fyShuffle(deDuped); // shuffle the array for slide output
                shuffled = limitArrayTo(shuffled, 15); // take the top x
                const output = filterFilenames(shuffled); // clean up the names for bingo cards
                slideMap.set(category, output);
                dirResolve(slideMap);
            });
        }));
    });


    // wait to save until all are done.
    Promise.all(allSlidePromises).then(() => {
        writeSlideCallSheet(slideMap, () => {
            writePptx(slideMap, pptx)
                .then(() => {
                    try {
                        pptx.save(path.join('.', category, `NtF-${todayStamp}.pptx`), (filename) => {
                            console.log(`Finishing up writing ${filename}, then exiting...`);
                        });
                    } catch (err) {
                        console.error(err);
                        process.exit(1);
                    }
                });
        });
    }, (err) => {
        console.error(err);
        process.exit(1);
    });
});
