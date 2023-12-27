"use strict";

exports.isSupported = (function() {
    try {
        // eslint-disable-next-line no-unused-vars
        const blob = new Blob();
        // eslint-disable-next-line no-unused-vars
        const fileReader = new FileReader();

        return true;
    } catch (e) {
        return false;
    }
})();
