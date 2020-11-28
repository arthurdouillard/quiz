var GLOBAL_CORS_PROXY = "http://cors-anywhere.herokuapp.com/";
var ankiSeparator = '\x1f';

// deckNotes contains the contents of any APKG decks uploaded. It is an array of
// objects with the following properties:
// - "name", a string
// - "fieldNames", an array of strings
// - "notes", an array of objects, each with properties corresponding to the
// entries of fieldNames.
var deckNotes;
var deckIndex = 0;
var noteIndex = 0;
var SQL;
var mapImageToBase64 = {};


function sqlToTable(uInt8ArraySQLdb) {
    var db = new SQL.Database(uInt8ArraySQLdb);

    // Decks table (for deck names)
    decks = db.exec("SELECT decks FROM col");
    // Could use parseJSON from jQuery here.
    decks = Function('return ' + decks[0].values[0][0])();

    // Models table (for field names)
    col = db.exec("SELECT models FROM col");
    // Could use parseJSON from jQuery here.
    var models = Function('return ' + col[0].values[0][0])();

    // Notes table, for raw facts that make up individual cards
    deckNotes = db.exec("SELECT mid,flds FROM notes");

    _.each(_.keys(models), function (key) {
        models[key].fields = _.pluck(models[key].flds, 'name');
    });

    var notesByModel =
        _.groupBy(deckNotes[0].values, function (row) { return row[0]; });

    deckNotes = _.map(notesByModel, function (notesArray, modelId) {
        var modelName = models[modelId].name;
        var fieldNames = models[modelId].fields;
        var notesArray = _.map(notesArray, function (note) {
            var fields = note[1].split(ankiSeparator);
            return arrayNamesToObj(fieldNames, fields);
        });
        return { name: modelName, notes: notesArray, fieldNames: fieldNames };
    });
}


function visualize() {
    document.onkeydown = changeCard;

    document.getElementById("previous-button").addEventListener('click', changePrevious);
    document.getElementById("after-button").addEventListener('click', changeAfter);
    document.getElementById("card").addEventListener('click', function (e) {
        if (document.getElementById("card-global-back").style.visibility == "visible") {
            document.getElementById("card-global-back").style.visibility = "hidden";
            document.getElementById("card-helper").style.display = "block";
        } else {
            document.getElementById("card-global-back").style.visibility = "visible";
            document.getElementById("card-helper").style.display = "none";
        }
    });
    noteIndex = 33;
    displayCard();
}


function displayCard() {
    let card = document.getElementById("card");

    console.log(noteIndex);
    document.getElementById("card-global-back").style.visibility = "hidden";
    document.getElementById("card-front").innerHTML = deckNotes[deckIndex].notes[noteIndex].Front;
    document.getElementById("card-back").innerHTML = deckNotes[deckIndex].notes[noteIndex].Back;
    document.getElementById("card-details1").innerHTML = deckNotes[deckIndex].notes[noteIndex].Details1;
    document.getElementById("card-details2").innerHTML = deckNotes[deckIndex].notes[noteIndex].Details2;
    document.getElementById("card-image").innerHTML = deckNotes[deckIndex].notes[noteIndex].Image;

    let images = card.getElementsByTagName("img");
    for (let i = 0; i < images.length; i++) {
        let key = decodeURI(images[i].src.split('/').pop());
        if (key in mapImageToBase64) {
            images[i].src = "data:image/png;base64," + mapImageToBase64[key];
        };
        images[i].style = 'height: 100% width: 80%; object-fit: contain';
    }

    try {
        MathJax.typesetPromise()
    } catch (error) {
        console.log(error)
    }

    document.getElementById("card-counter").innerHTML = (noteIndex + 1) + " / " + deckNotes[deckIndex].notes.length;
}

function changePrevious(e) {
    if (noteIndex > 0) {
        noteIndex--;
        displayCard();
    }
}

function changeAfter(e) {
    if (noteIndex < deckNotes[deckIndex].notes.length - 1) {
        noteIndex++;
        displayCard();
    }
}

function changeCard(e) {
    e = e || window.event;

    if (e.keyCode == '38') {
        // up arrow
        document.getElementById("card-global-back").style.visibility = "hidden";
        document.getElementById("card-helper").style.display = "block";
    }
    else if (e.keyCode == '40') {
        // down arrow
        document.getElementById("card-global-back").style.visibility = "visible";
        document.getElementById("card-helper").style.display = "none";
    }
    else if (e.keyCode == '37') {
        // left arrow
        changePrevious(e);
    }
    else if (e.keyCode == '39') {
        // right arrow
        changeAfter(e);
    }

}


function parseImages(imageTable, unzip, filenames) {
    for (var prop in imageTable) {
        if (filenames.indexOf(prop) >= 0) {
            var file = unzip.decompress(prop);
            mapImageToBase64[imageTable[prop]] = converterEngine(file);
        }
    }
}

function converterEngine(input) { // fn BLOB => Binary => Base64 ?
    // adopted from https://github.com/NYTimes/svg-crowbar/issues/16
    var uInt8Array = new Uint8Array(input),
        i = uInt8Array.length;
    var biStr = []; //new Array(i);
    while (i--) {
        biStr[i] = String.fromCharCode(uInt8Array[i]);
    }
    var base64 = window.btoa(biStr.join(''));
    return base64;
};

function ankiBinaryToTable(ankiArray, options) {
    var compressed = new Uint8Array(ankiArray);
    var unzip = new Zlib.Unzip(compressed);
    var filenames = unzip.getFilenames();
    if (filenames.indexOf("collection.anki2") >= 0) {
        var plain = unzip.decompress("collection.anki2");
        sqlToTable(plain);

        if (filenames.indexOf("media") >= 0) {
            var plainmedia = unzip.decompress("media");
            var bb = new Blob([new Uint8Array(plainmedia)]);
            var f = new FileReader();
            f.onload = function (e) {
                parseImages(JSON.parse(e.target.result), unzip, filenames);
                visualize();
            };
            f.readAsText(bb);
        }
    }
}

function ankiURLToTable(ankiURL, options, useCorsProxy, corsProxyURL) {
    if (typeof useCorsProxy === 'undefined') {
        useCorsProxy = false;
    }
    if (typeof corsProxyURL === 'undefined') {
        corsProxyURL = GLOBAL_CORS_PROXY;
    }

    var zipxhr = new XMLHttpRequest();
    zipxhr.open('GET', (useCorsProxy ? corsProxyURL : "") + ankiURL, true);
    zipxhr.responseType = 'arraybuffer';
    zipxhr.onload = function (e) { ankiBinaryToTable(this.response, options); };
    zipxhr.send();
}

function arrayNamesToObj(fields, values) {
    var obj = {};
    for (i in values) {
        obj[fields[i]] = values[i];
    }
    return obj;
}


function readySetup() {
    var options = {};
    var setOptionsImageLoad = function () {
        options.loadImage = true;
        return options;
    }
    var eventHandleToTable = function (event) {
        event.stopPropagation();
        event.preventDefault();
        var f = event.target.files[0];
        if (!f) {
            f = event.dataTransfer.files[0];
        }
        // console.log(f.name);

        var reader = new FileReader();
        if ("function" in event.data) {
            reader.onload =
                function (e) { event.data.function(e.target.result); };
        } else {
            reader.onload = function (e) { ankiBinaryToTable(e.target.result, setOptionsImageLoad()); };
        }
        /* // If the callback doesn't need the File object, just use the above.
        reader.onload = (function(theFile) {
            return function(e) {
                console.log(theFile.name);
                ankiBinaryToTable(e.target.result);
            };
        })(f);
        */
        reader.readAsArrayBuffer(f);
    };

    // Deck browser
    $("#ankiFile")
        .change({
            "function":
                function (data) {
                    ankiBinaryToTable(data, setOptionsImageLoad());
                }
        }, eventHandleToTable);
    $("#ankiURLSubmit").click(function (event) {
        ankiURLToTable($("#ankiURL").val(), setOptionsImageLoad(), true);
        $("#ankiURL").val('');
    });

    // Only for local development
    ankiURLToTable('/anki_package.apkg');
};
