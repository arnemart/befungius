var _ = require('lodash');

module.exports = function() {
    var methods = {};
    var mm = function(what) {
        if (methods[what]) {
            return methods[what].apply(methods, Array.prototype.slice.call(arguments, 1).concat(what));
        } else {
            throw new Error('No implementation for ' + what);
        }
    };
    mm.on = function(what, method) {
        if (typeof method != 'function') {
            method = function() { return method; };
        }
        if (_.isArray(what)) {
            for (var i = 0; i < what.length; i++) {
                methods[what[i]] = method;
            }
        } else {
            methods[what] = method;
        }
        return mm;
    };
    return mm;
};
