var stack     = require('./stack');
var interpret = require('./mm')();
var _         = require('lodash');
var Immutable = require('immutable');

var directions = ['>', 'v', '<', '^'];

interpret.on(' ', function(state) {
    // Space: tickless noop
    return state.withMutations(function(state) {

        state = move(state);
        while (getInstruction(state) == ' ') {
            state = move(state);
        }
        state = move(state, -1);
        return state.set('notick', true);
    });


}).on('z', function(state) {
    // Explicit noop
    return state;

    /*
     * Movement
     */

}).on(directions, function(state, settings, which) {
    // Change direction
    return state.set('direction', which);

}).on('?', function(state) {
    // Random direction
    return state.set('direction', _.sample(directions));

}).on('[', function(state) {
    // Turn left
    return state.update('direction', function(dir) {
        var pos = directions.indexOf(dir) - 1;
        if (pos < 0) {
            return directions[pos + 4];
        } else {
            return directions[pos];
        }
    });

}).on(']', function(state) {
    // Turn right
    return state.update('direction', function(dir) {
        return directions[(directions.indexOf(dir) + 1) % 4];
    });

}).on('r', function(state) {
    // Reverse direction
    return state.update('direction', function(dir) {
        return directions[(directions.indexOf(dir) + 2) % 4];
    });

}).on('x', function(state) {
    // Pop values to set direction vector
    return stack.pop(state, function(state, dy, dx) {
        if (dx == 0) {
            if (dy == -1) {
                return state.set('direction', '^');
            } else if (dy == 1) {
                return state.set('direction', 'v');
            }
        } else if (dy == 0) {
            if (dx == -1) {
                return state.set('direction', '<');
            } else if (dx == 1) {
                return state.set('direction', '>');
            }
        }
        return state;
    });


    /*
     * Flow control
     */

}).on('#', function(state) {
    // Skip a cell
    return move(state);

}).on('@', function(state) {
    // TER-MI-NATE
    return state.withMutations(function(state) {
        return state.set('terminated', true).set('running', false);
    });

}).on(';', function(state) {
    // Start skipmode
    // Skipmode should never tick
    return state.withMutations(function(state) {
        return state.set('skipmode', true).set('notick', true);
    });

}).on('skip', function(state, settings, which) {
    // Continue skipmode
    // Skipmode should never tick
    return state.withMutations(function(state) {
        while (getInstruction(state) != ';') {
            state = move(state);
        }
        return state.set('skipmode', false).set('notick', true);
    });

}).on('j', function(state) {
    // Skip several cells
    var self = this;

    return state.withMutations(function(state) {
        return stack.pop(state, function(state, val) {
            if (val < 0) {
                return self['r'](_.reduce(_.range(-val), function(state) {
                    return move(state);
                }, self['r'](state)));
            } else {
                return _.reduce(_.range(val), function(state) {
                    return move(state);
                }, state);
            }
        });
    });

}).on('q', function(state) {
    // Quit and set return code
    return stack.pop(state, function(state, val) {
        return state.withMutations(function(state) {
            return state.set('terminated', false).set('running', false).set('returncode', val);
        });
    });

}).on('k', function(state, settings) {
    // Iterate
    return stack.pop(state, function(state, val) {
        if (val == 0) {
            return move(state);
        } else {
            var movedState = moveToNext(move(state));
            var instr = getInstruction(movedState);
            return _.reduce(_.range(val), function(state) {
                return interpret(instr, state, settings);
            }, state);
        }
    });


    /*
     * Decision making
     */

}).on('!', function(state) {
    // Not
    return stack.pop(state, function(state, val) {
        return stack.push(state, (val == 0 ? 1 : 0));
    });

}).on('`', function(state) {
    // Greater than
    return stack.pop(state, function(state, val1, val2) {
        return stack.push(state, (val2 > val1 ? 1 : 0));
    });

}).on('_', function(state) {
    // East-west if
    return stack.pop(state, function(state, val) {
        if (val === undefined) {
            throw new Error('undefined val in if');
        }
        return state.set('direction', (val == 0 ? '>' : '<'));
    });

}).on('|', function(state) {
    // North-south if
    return stack.pop(state, function(state, val) {
        return state.set('direction', (val == 0 ? 'v' : '^'));
    });

}).on('w', function(state) {
    // Compare
    return stack.pop(state, function(state, val1, val2) {
        if (val1 > val2) {
            return this['['](state);
        } else if (val1 < val2) {
            return this[']'](state);
        }
        return state;
    }.bind(this));


    /*
     * Numbers, math
     */

}).on('1234567890abcdef'.split(''), function(state, settings, which) {
    // Push a number
    return stack.push(state, parseInt(which, 16));

}).on(['+', '-', '*'], function(state, settings, which) {
    // Add, subtract, delete
    return stack.pop(state, function(state, val1, val2) {
        return stack.push(state, eval('(' + val2 + ')' + which + '(' + val1 + ')'));
    });

}).on(['/', '%'], function(state, settings, which) {
    // Divide, mod (need div-by-zero-protection)
    return stack.pop(state, function(state, val1, val2) {
        if (val1 == 0) {
            return stack.push(state, 0);
        } else {
            return stack.push(state, Math.floor(eval('(' + val2 + ')' + which + '(' + val1 + ')')));
        }
    });


    /*
     * Strings
     */

}).on('"', function(state) {
    // Start stringmode
    return state.set('stringmode', true);

}).on('string', function(state, settings, which) {
    // Continue stringmode
    if (which == '"') {
        return state.withMutations(function(stack) {
            return stack.set('stringmode', false).set('currentStringLength', 0);
        });
    } else if (which == ' ' && stack.top(state) == 32 && state.get('currentStringLength') >= 1) {
        // Don't add duplicate spaces, and don't tick
        return state.set('notick', true);
    } else {
        return stack.push(state, which.charCodeAt(0)).update('currentStringLength', function(n) { return n + 1; });;
    }

}).on("'", function(inState) {
    // Fetch character
    var state = move(inState);
    return stack.push(state, getInstruction(state).charCodeAt(0));

}).on('s', function(state) {
    // Store character
    return stack.pop(move(state), function(state, val) {
        return writeInstruction(state, val);
    });


    /*
     * Stack manipulation
     */

}).on('$', function(state) {
    // Pop and discard value
    return stack.pop(state, function(state, val) { return state; });

}).on(':', function(state) {
    // Duplicate top stack value
    return stack.pop(state, function(state, val) {
        return stack.push(state, [val, val]);
    });

}).on('\\', function(state) {
    // Swap top values
    return stack.pop(state, function(state, val1, val2) {
        return stack.push(state, [val1, val2]);
    });

}).on('n', function(state) {
    // Clear stack
    return stack.clear(state);


    /*
     * Stack stack manipulation
     */

    // }).on('{', function(state) {
    //     // Begin block
    //     return stack.pop(state, function(state, count) {
    //         return stack.pushStack(state, function(state) {
    //         });
    //     });
    // }).on('}', function(state) {
    //     // End block
    //     return stack.pop(state, function(state, count) {
    //         return stack.popStack(state, function(state) {
    //         });
    //     });

    /*
     * Funge-space storage
     */

}).on('g', function(state) {
    // Read from program
    return stack.pop(state, function(state, y, x) {
        return stack.push(state, getInstruction(state, x, y).charCodeAt(0));
    });

}).on('p', function(state) {
    // Write into program
    return stack.pop(state, function(state, y, x, instr) {
        return writeInstruction(state, instr, x, y);
    });


    /*
     * Input/output
     */

}).on('.', function(state, settings) {
    // Output a number
    return stack.pop(state, function(state, val) {
        settings.output(val);
        return state.update('outputString', function(s) { return s + val; });
    });

}).on(',', function(state, settings) {
    // Output a character
    return stack.pop(state, function(state, val) {
        var c = String.fromCharCode(val);
        settings.output(c);
        return state.update('outputString', function(s) { return s + c; });
    });
});


function move(state, delta) {
    if (delta === undefined) {
        delta = 1;
    }
    switch (state.get('direction')) {
    case '>':
        return state.update('x', function(oldX) {
            return (oldX + delta) % state.get('width');
        });
        break;
    case '<':
        return state.update('x', function(oldX) {
            var newX = oldX - delta;
            if (newX < 0) {
                return state.get('width') - 1;
            }
            return newX;
        });
        break;
    case 'v':
        return state.update('y', function(oldY) {
            return (oldY + delta) % state.get('height');
        });
        break;
    case '^':
        return state.update('y', function(oldY) {
            var newY = oldY - delta;
            if (newY < 0) {
                return state.get('height') - 1;
            }
            return newY;
        });
        break;
    }
}

function moveToNext(state) {
    var instr = getInstruction(state);
    if (instr != ' ' && instr != ';') {
        return state;
    } else {
        return moveToNext(move(state));
    }
}

function tick(state) {
    if (state.get('notick')) {
        return state.set('notick', false);
    } else {
        return state.update('tick', function(tick) {
            return tick + 1;
        });
    }
}

function writeInstruction(state, instruction, x, y) {
    if (x === undefined) {
        x = state.get('x');
    }
    if (y === undefined) {
        y = state.get('y');
    }
    if (x < 0) {
        x = x + state.get('width');
    }
    if (y < 0) {
        y = y + state.get('height');
    }
    if (state.get('height') <= y) {
        state = state.withMutations(function(state) {
            return _.reduce(_.range(state.get('height'), y + 1), function(state, i) {
                return state.update('program', function(program) {
                    return program.set(i, Immutable.Vector());
                });
            }, state).set('height', y + 1);

        });
    }
    return state.withMutations(function(state) {
        return state.updateIn(['program', y], function(v) {
            return v.withMutations(function(v) {
                while (v.length < x) {
                    v.push(' ');
                }
                return v.set(x, String.fromCharCode(instruction));
            });
        }).set('width', state.get('program').reduce(function(longest, line) {
            return Math.max(longest, line.length);
        }, 0)).set('height', state.get('program').length);
    });
}

function getInstruction(state, x, y) {
    if (x === undefined) {
        x = state.get('x');
    }
    if (y === undefined) {
        y = state.get('y');
    }
    if (x < 0) {
        x = x + state.get('width');
    }
    if (y < 0) {
        y = y + state.get('height');
    }
    return state.getIn(['program', y, x], ' ');
}

module.exports = function(inState, settings) {
    var state = move(inState);
    var instruction = getInstruction(state);
    var realInstruction = instruction;
    // try {
    if (state.get('stringmode')) {
        instruction = 'string';
    } else if (state.get('skipmode')) {
        instruction = 'skip';
    }
    return interpret(instruction, tick(state, instruction), settings, realInstruction);

    // } catch (e) {
    //     var m = e.toString();
    //     throw new Error(m + ' (at ' + state.get('x') + ', ' + (state.get('y') + 1) + ')');
    // }
};
