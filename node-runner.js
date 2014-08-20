var Befunge = require('./befunge');
var fs = require('fs');

var program = fs.readFileSync(process.argv[2]).toString();

var b = Befunge(program, {
    output: function(s) {
        process.stdout.write(s.toString());
    }
});

b.run();
