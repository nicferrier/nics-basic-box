window.addEventListener("load", loadEvt => {
    const table = document.querySelector("section.code").appendChild(document.createElement("table"));
    new Array(26).fill().map((o,i) => String.fromCharCode("A".charCodeAt(0) + i)).forEach((o,i) => {
        const row = table.appendChild(document.createElement("tr"));
        const label = row.appendChild(document.createElement("td"));
        label.classList.add("label");
        label.textContent = o;
        const code = row.appendChild(document.createElement("td"));
        code.classList.add("code");
        code.setAttribute("contenteditable", "true");
    });

    const separators = " \t";
    const keywords = [
        "EOF",
        "LET",
        "GOTO",
        "FOR",
        "TO",
        "NEXT",
        "IF",
        "THEN",
        "ELSE",
        "INPUT",
        "DRAW",
        "MOVE",
        "CLS",
        "PRINT",
        "LEN",
        "DIV",
        "MOD",
        "RAND",
        "SIN",
        "COS",
        "SIN",
        "TAN"
    ];

    const keywordChars = keywords.reduce((a,keyword) => {
        return Array.from(keyword)
            .reduce((charList, ch) => {
                return charList.indexOf(ch) < 0 ? charList.concat([ch]) : charList;
            }, a);
    }, []);

    const operatorChars = [
        "+",
        "-",
        "/",
        "*",
        "=",
        ">",
        "<",
        "!="
    ];

    const identifierChars = "$%abcdefghijklmnopqrstuvwxyz_";
    const numerals = "0123456789";
    const realChars = numerals + ".";
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    let tokens = Array.from(separators).reduce((a, o) => { a[o] = "separator"; return a; }, {});
    tokens = keywordChars.reduce((a,o) => { a[o] = "keyword"; return a; }, tokens);
    tokens = Array.from(identifierChars).reduce((a,o) => {a[o] = "identifier"; return a; }, tokens);
    tokens = Array.from(numerals).reduce((a, o) => {a[o]="numeral"; return a;}, tokens);
    tokens = Array.from(operatorChars).reduce((a,o) => {a[o]="operator"; return a;}, tokens);
    tokens["."] = ".";
    tokens["\""] = "quote";
    tokens = Array.from(labels).reduce((a,o) => {a[o]="label"; return a;}, tokens);

    const lineToTokenList = function (sourceLine) {
        const tokenState = {
            lastChar: -1,
            tokenList: [],
            currentToken: {}
        };

        const makeToken = function (start, end, type) {
            return {
                type,
                start,
                end,
                str: ""
            };
        };

        const tokenizer = function (ch, pos) {
            const tokenType = tokens[ch];
            
            if (tokenState.currentToken.type === "string") {
                if (tokenType !== "quote") {
                    tokenState.currentToken.str = tokenState.currentToken.str.concat(ch);
                    tokenState.currentToken.end = pos;
                }
                return;
            }
        
            if (tokenState.currentToken.type === tokenType) {
                tokenState.currentToken.str = tokenState.currentToken.str.concat(ch);
                tokenState.currentToken.end = pos;
            }
            else if (tokenState.currentToken.type === "numeral" && tokenType === ".") {
                tokenState.currentToken.type = "real";
                tokenState.currentToken.str = tokenState.currentToken.str + ch;
            }
            else {
                let newToken;
                if (tokenType === "quote") {
                    newToken = makeToken(pos,pos,"string");
                }
                else {
                    if (keywords.indexOf(tokenState.currentToken.str) > -1) {
                        tokenState.currentToken.type = "keyword";
                    }
                    newToken = makeToken(pos,pos,tokenType);
                    newToken.str = ch;
                }
                tokenState.tokenList = tokenState.tokenList.concat([newToken]);
                tokenState.currentToken = newToken;
            }
        };

        // Start parsing
        for (let i = 0; i < sourceLine.length; i++) {
            const ch = sourceLine[i];
            tokenizer(ch);
        }

        const programTokens = tokenState.tokenList
              .filter(token => token.type !== "separator")
              .concat([makeToken(-1,-1,"eof")])
              .map((token, i, a) => { 
                  if (token.type !== "eof") {
                      token.next = a[i + 1];
                  }
                  return token;
              });
        return programTokens;
    };

    class ParseError extends Error {
        constructor(message, token) {
            super(message);
            this.token = token;
        }
    };

    const expressionCompiler = function (tokenRoot) {
        /***
          expression-value = identifier | real | numeral | string
          expression =
              expression-value | expression-value operator expression
        ***/

        const operations = {
            "+": function (left, right) { return left + right; },
            "-": function (left, right) { return left - right; },
            "*": function (left, right) { return left * right; },
            "/": function (left, right) { return left / right; }
        };

        const operandValueCompiler = function (token) {
            // console.log(`ovc[1] ${token.type} ${token.str}`);
            return function(machine) {
                // console.log(`ovc[2] ${token.type} ${token.str}`);
                return ({
                    "identifier": _ => machine.memory[token.str],
                    "real": _ => Number.parseFloat(token.str),
                    "numeral": _ => Number.parseInt(token.str),
                    "string": _ => token.str
                }[token.type])();
            };
        };

        const consumeExpression = function (parentToken, expressionCompletion=operandValueCompiler) {
            const token = parentToken.next;

            if (["identifier", "real", "numeral", "string"].indexOf(token.type) < 0) {
                throw new ParseError("expression should start with identifier or value");
            }

            if (token.next.type === "eof") { // FIXME:: think we need a variety of end tokens
                // console.log(`c-e eof case ${token.type} ${token.str}`);
                return {
                    code: expressionCompletion(token),
                    next: token.next
                };
            }

            if (token.next.type === "operator") {
                const operatorToken = token.next;
                // console.log(`c-e operator case ${token.type} ${token.str}`);

                const retValue = consumeExpression(token.next, function (rightOperandToken) {
                    // console.log(`recur completion ${token.type} ${token.str}`);
                    return function(machine) {
                        const leftOperandValue = expressionCompletion(token)(machine);
                        const rightOperandValue = (operandValueCompiler(rightOperandToken))(machine);
                        return operations[operatorToken.str](leftOperandValue, rightOperandValue);
                    }
                });
                return retValue;
            }
        };

        return consumeExpression(tokenRoot);
    };

    const parseTokenList = function(tokenList) {
        const parse = function (token) {
            switch (token.type) {
            case "keyword":
                switch (token.str) {
                case "LET": {
                    if (token.next.type !== "identifier") {
                        throw new ParseError("expected identifier", token.next);
                    }

                    const identifierToken = token.next;
                    if (identifierToken.next.type !== "keyword"
                        && identifierToken.next.str !== "=") {
                        throw new ParseError("expected asignment", identifierToken);
                    }

                    const expression = expressionCompiler(token.next.next);
                    return {
                        token: expression.token,
                        code: function (machine) {
                            const value = expression.code(machine);
                            const name = identifierToken.str;
                            
                            /* FIXMEEEE!!!!
                               if (name.startsWith("%") && valueToken.type !== "") {
                               throw new ParseError("expected an integer", valueToken);
                               }
                               if (name.startsWith("$") && valueToken.type !== "string") {
                               throw new ParseError("expected a string", valueToken);
                               }
                            */
                            
                            machine.memory[name] = value;
                        }
                    };
                }

                case "PRINT": {
                    if (["identifier", "real", "numeral", "string"].indexOf(token.next.type) < 0) {
                        throw new ParseError("expected a value", token.next);
                    }
                    const valueToken = token.next;
                    return {
                        code: function (machine) {
                            // console.log("PRINT command", valueToken, machine);
                            if (valueToken.type === "identifier") {
                                // FIXME runtime error if the identifier can't be found
                                machine.display.print(machine.memory[valueToken.str]);
                            }
                            else {
                                machine.display.print(valueToken.str);
                            }
                        },
                        token: valueToken
                    };
                }

                case "GOTO": {
                    if (token.next.type !== "label") {
                        throw new ParseError("expected a label", token.next);
                    }

                    const label = token.next.str;
                    return {
                        code: function (machine) {
                            machine.pc = label;
                        },
                        token
                    };
                }
                }
            }
        };

        // console.log("program tokens", programTokens);
        
        return parse(tokenList[0]);
    };

    const parseLine = function (sourceLine) { return parseTokenList(lineToTokenList(sourceLine)); };
    const executeLine = function (line, machine) {
        const parseLineResult = parseLine(line);
        parseLineResult.code(machine);
    };

    const machine = {
        pc: "undefined",
        memory: {},
        display: {
            draw: function (arguments) {
                console.log("----- drawing -----");
            },
            print: function (arguments) {
                console.log(arguments);
            }
        }
    };

    const lines = {
        "A": "LET x = 10",
        "B": "PRINT x",
        "C": "LET $x = \"Hello World\"",
        "D": "PRINT $x",
        "E": "EOF"
    };

    const lines2 = {
        "A": "LET x = 10",
        "B": "PRINT x",
        "C": "LET $x = \"hello\"",
        "D": "PRINT $x",
        "F": "IF x > 10 THEN GOTO I",
        "G": "x = x + 1",
        "H": "GOTO B",
        "I": "PRINT \"end\"",
        "J": "EOF"
    };

    (function testProgramCompiler () {
        const doThisTest = true;
        if (!doThisTest) return;
        try {
            machine.pc = "A";
            function exec(machine, program) {
                const line = program[machine.pc];
                // console.log(`execute ${machine.pc} ${line}`);
                if (line === "EOF") {
                    return;
                }

                const pcNext = String.fromCharCode(machine.pc.charCodeAt(0) + 1);
                machine.pc = pcNext;
                // console.log("line", line, machine);
                executeLine(line, machine); // might set pc
                exec(machine, program);
            }
            exec(machine, lines);
            console.log("after program", machine.memory);
        }
        catch (e) {
            console.log("error", e.token, e);
        }
    })();

    (function testConsumingExpressions () {
        const doThisTest = false;
        if (!doThisTest) return;
        machine.memory.a = "10";
        const tokenList = lineToTokenList("LET 7 * a / 2");
        const consumerReturn = consumer(tokenList);
        console.log(consumerReturn.code(machine));
    })(); 
});
