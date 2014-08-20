module.exports = function(programString) {
    return programString.split(/\r?\n/).map(function(line) {
        return line.split('');
    });
};
