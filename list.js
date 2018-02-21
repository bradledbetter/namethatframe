const fs = require('fs');
const path = require('path');
// const imageSize = require('image-size');
const sharp = require('sharp');
const PptxGenJs = require('pptxgenjs');
const MAX_IMAGE_WIDTH_PX = 958;
const MAX_IMAGE_HEIGHT_PX = 540;
let delta = 0;

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

// let's do this
getDirectories((directories) => {
    let writeCount = 0;
    directories.forEach((category) => {
        fs.readdir(path.join('.', category), (err, filenames) => {
            if (err) {
                fs.close(fd, () => {
                    process.exit();
                });
            }

            const deDuped = removeDuplicates(filenames);
            const output = filterFilenames(deDuped);
            const shuffled = fyShuffle(deDuped);// shuffle the array for slide output
            writeSlideTextFiles(category, output.join(''), shuffled.join(''), () => {
                // create a pptx
                const pptx = new PptxGenJs();
                pptx.setLayout('LAYOUT_WIDE');// 13.33 x 7.5 inches | 957.6 x 540 px

                shuffled.forEach((slideFilename, slideIndex) => {
                    if (slideFilename.match(/\.(png|jpg|gif)$/) !== null) {
                        const slidePath = path.join('.', category, slideFilename);
                        console.log(`${slideIndex}: ${slidePath}5`);
                        const slide = pptx.addNewSlide();
                        slide.back = '000000';
                        slide.color = 'FFFFFF';
                        slide.slideNumber({x: '90%', y: '90%', fontFace: 'Courier', fontSize: 16, color: 'FFFFFF'});

                        // get image size synchronously. Probably slow, but easy to code.
                        const image = sharp(slidePath);
                        image.metadata((err, imgData) => {
                            if (err) {
                                console.error(err);
                                process.exit();
                            }

                            const newImgDim = {
                                width: imgData.width,
                                height: imgData.height
                            };

                            // TODO: I'm shooting from the hip here, so I need to test
                            // scale the largest dimension
                            delta = 0;
                            if (imgData.width >= imgData.height) {
                                // landscape
                                newImgDim.width = MAX_IMAGE_WIDTH_PX;
                                newImgDim.height = imgData.height * (imgData.width / MAX_IMAGE_WIDTH_PX);

                                // make sure height is still within bounds
                                if (newImgDim.height > MAX_IMAGE_HEIGHT_PX) {
                                    // delta = newImgDim.height - MAX_IMAGE_HEIGHT_PX;
                                    newImgDim.width = newImgDim.width * (MAX_IMAGE_HEIGHT_PX / (newImgDim.height));
                                    newImgDim.height = MAX_IMAGE_HEIGHT_PX;
                                }
                            } else {
                                // portrait
                                newImgDim.height = MAX_IMAGE_HEIGHT_PX;
                                newImgDim.width = imgData.width * (imgData.height / MAX_IMAGE_HEIGHT_PX);

                                // make sure width is still within bounds (Should be, but y'know)
                                if (newImgDim.width > MAX_IMAGE_WIDTH_PX) {
                                    // delta = newImgDim.width - MAX_IMAGE_WIDTH_PX;
                                    newImgDim.height = newImgDim.height * (MAX_IMAGE_WIDTH_PX / (newImgDim.width));
                                    newImgDim.width = MAX_IMAGE_WIDTH_PX;
                                }
                            }

                            slide.addImage({
                                path: slidePath,
                                // centered
                                x: Math.max((MAX_IMAGE_WIDTH_PX - newImgDim.width) / 2.0, 0),
                                y: Math.max((MAX_IMAGE_HEIGHT_PX - newImgDim.height) / 2.0, 0),
                                w: newImgDim.width,
                                h: newImgDim.height
                            });
                        });
                    }
                });

                // save the pptx
                pptx.save(path.join('.', category, 'slideshow.pptx'), () => {
                    // exit when done with all
                    if (++writeCount === directories.length) {
                        process.exit();
                    }
                });
            });
        });
    });
});
