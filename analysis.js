const esprima = require("esprima");
const options = {tokens:true, tolerant: true, loc: true, range: true };
const fs = require("fs");
const chalk = require('chalk');
const glob = require("glob");
//to test run 'node analysis.js {your file path here}'

//Whether or not a threshold was met. If true, fail build
let thresholdsMet = false;
let threshholdsPairs = '';
function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		// default value is self if no other script is provided.
		args = ['analysis.js'];
	}
	var directory_name = args[0];

	console.log( "Parsing ast and running static analysis...");

	// Function to get current filenames
	// in directory
	let filenames = [];
  
	//console.log("\nFilenames in directory:");

	// some options
	let options = {
 
		ignore: ['node_modules/**', '**/analysis.js']
 
	},
 
	// for Files
	forFiles = function(err,files){ 
		filenames = files;
		// console.log('in call back ' + filenames);

		filenames.forEach((fileName) => {

			console.log("\nFile:", fileName);
			//fileName = directory_name + '/' + fileName;
			var builders = {};
			complexity(fileName, builders);
			console.log( "Complete.");
	
	
			// Report
			for( var node in builders )
			{
				var builder = builders[node];
				builder.report();
			}
	
		});

		endChecks();
	};

	// glob it.
	glob('**/*.js', options, forFiles);

	
}

function endChecks() {
	if(thresholdsMet){
		console.log('Static analysis checks failed: \n' + threshholdsPairs);
		throw new Error('Thresholds exceeded, build failed');
	}
}

function complexity(filePath, builders)
{
	var buf = fs.readFileSync(filePath, "utf8");
	var ast = esprima.parse(buf, options);

	var i = 0;

	// Initialize builder for file-level information
	var fileBuilder = new FileBuilder();
	fileBuilder.FileName = filePath;
	builders[filePath] = fileBuilder;

	// Traverse program with a function visitor.
	traverseWithParents(ast, function (node) 
	{
		// File level calculations
		// 1. Strings
		if( node.type == "Literal" && typeof node.value == "string" )
		{
			fileBuilder.Strings++;
		}

		// 2. Packages
		if( node.type == "CallExpression" && node.callee.type == "Identifier" && node.callee.name == "require")
		{
			fileBuilder.ImportCount++;			
		}

		if (node.type === 'FunctionDeclaration') 
		{
			var builder = new FunctionBuilder();

			builder.FunctionName = functionName(node);
			builder.StartLine    = node.loc.start.line;
			// Calculate function level properties.
			// 3. Parameters
			builder.ParameterCount = node.params.length;
			// 4. Method Length
			builder.Length = node.loc.end.line - node.loc.start.line;

			// With new visitor(s)...
			// 5. CyclomaticComplexity
			traverseWithParents(node, function (child) 
			{
				if( isDecision(child))
				{
					builder.SimpleCyclomaticComplexity++;				
				}
			});

			// 6. Halstead
			let idenArr = [];
			traverseWithParents(node, function (child) 
			{
				if( child.type == 'Identifier')
				{
					if(idenArr.includes(child.name) == false){
						idenArr.push(child.name);
						builder.Halstead++;	
					}
				} else if (child.type == 'BinaryExpression')
				{
					builder.Halstead++;
				}
			});

			//MaxNestingDepth
			let maxDepth = 0;
			
			traverseWithParents(node, function (child) {

				let tempCount = 0;

				if(childrenLength(child) == 0){
					
					while(child.parent != null){
						child = child.parent;
						if(child.type == "FunctionDeclaration"){
							if(tempCount > maxDepth){
								maxDepth = tempCount;
								tempCount = 0;
							}
							break;
						} else if (isDecision(child) && child.parent.alternate == null ){
							tempCount += 1;
						}

					}
				}

				builder.MaxNestingDepth = maxDepth;
			});

			//message chains
			let finalChainResult = 0;
			traverseWithParents(node, function(child) {
				
					let tempChainCount = 0;
					traverseWithParents(child, function (grandchild) 
					{
						if(grandchild.type === 'ExpressionStatement' || grandchild.type === 'CallExpression')
						{
							tempChainCount+=0;
						}
						else if(grandchild.type === 'MemberExpression')
						{
							tempChainCount+=1;
						}
					
						finalChainResult = Math.max(finalChainResult, tempChainCount);

						if(childrenLength(grandchild) == 0){
							tempChainCount = 0;
						}
					});
					tempChainCount = 0;
					
				builder.MaxMessageChain = finalChainResult;
			});

			builders[builder.FunctionName] = builder;

			if(builder.Length > 100 || builder.MaxMessageChain > 10 || builder.MaxNestingDepth > 5){
				thresholdsMet = true;
				if(builder.Length > 100) {
					threshholdsPairs += fileBuilder.FileName + ': ' + builder.FunctionName + ', method length over 100, reached : ' + builder.Length + '\n';
				}
				if(builder.MaxMessageChain > 10) {
					threshholdsPairs += fileBuilder.FileName + ': ' + builder.FunctionName + ', has method chain over 10, reached : ' + builder.MaxMessageChain + '\n';
				}
				if(builder.MaxNestingDepth > 5) {
					threshholdsPairs += fileBuilder.FileName + ': ' + builder.FunctionName + ', has max nesting depth over 5, reached : ' + builder.MaxNestingDepth + '\n';
				}
			}
		}

	});

}

// Represent a reusable "class" following the Builder pattern.
class FunctionBuilder
{
	constructor() {
		this.StartLine = 0;
		this.FunctionName = "";
		// The number of parameters for functions
		this.ParameterCount  = 0;
		// The number of lines.
		this.Length = 0;
		// Number of if statements/loops + 1
		this.SimpleCyclomaticComplexity = 1;
		// Number of unique symbols + operators
		this.Halstead = 0;
		// The max depth of scopes (nested ifs, loops, etc)
		this.MaxNestingDepth    = 0;
		// The max number of conditions if one decision statement.
		this.MaxConditions      = 0;
		// the max length of a message chain in one line
		this.MaxMessageChain = 0;
	}

	threshold() {

        const thresholds = {
            SimpleCyclomaticComplexity: [{t: 10, color: 'red'}, {t: 4, color: 'yellow'}],
            Halstead: [{t: 10, color: 'red'}, {t: 3, color: 'yellow'}],
            ParameterCount: [{t: 10, color: 'red'}, {t: 3, color: 'yellow'}],
            Length: [{t: 100, color: 'red'}, {t: 10, color: 'yellow'} ],
			MaxNestingDepth: [{t: 5, color: 'red'}, {t: 4, color: 'yellow'} ],
			MaxMessageChain: [{t: 10, color: 'red'}, {t: 8, color: 'yellow'} ]
        }

        const showScore = (id, value) => {
            let scores = thresholds[id];
            const lowestThreshold = {t: 0, color: 'green'};
            const score = scores.sort( (a,b) => {a.t - b.t}).find(score => score.t <= value) || lowestThreshold;
            return score.color;
        };

        this.Halstead = chalk`{${showScore('Halstead', this.Halstead)} ${this.Halstead}}`;
        this.Length = chalk`{${showScore('Length', this.Length)} ${this.Length}}`;
        this.ParameterCount = chalk`{${showScore('ParameterCount', this.ParameterCount)} ${this.ParameterCount}}`;
        this.SimpleCyclomaticComplexity = chalk`{${showScore('SimpleCyclomaticComplexity', this.SimpleCyclomaticComplexity)} ${this.SimpleCyclomaticComplexity}}`;
		this.MaxNestingDepth = chalk`{${showScore('MaxNestingDepth', this.MaxNestingDepth)} ${this.MaxNestingDepth}}`;
		this.MaxMessageChain = chalk`{${showScore('MaxMessageChain', this.MaxMessageChain)} ${this.MaxMessageChain}}`;


	}

	report()
	{
		this.threshold();

		console.log(
chalk`{blue.underline ${this.FunctionName}}(): at line #${this.StartLine}
Parameters: ${this.ParameterCount}\tLength: ${this.Length}
Cyclomatic: ${this.SimpleCyclomaticComplexity}\tHalstead: ${this.Halstead}
MaxDepth: ${this.MaxNestingDepth}\tMaxMessageChain: ${this.MaxMessageChain}\t\n`
);
	}
};

// A builder for storing file level information.
function FileBuilder()
{
	this.FileName = "";
	// Number of strings in a file.
	this.Strings = 0;
	// Number of imports in a file.
	this.ImportCount = 0;

	this.report = function()
	{
		console.log (
			chalk`{magenta.underline ${this.FileName}}
Packages: ${this.ImportCount}
Strings ${this.Strings}
`);

	}
}

// A function following the Visitor pattern.
// Annotates nodes with parent objects.
function traverseWithParents(object, visitor)
{
    var key, child;

    visitor.call(null, object);

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && key != 'parent') 
            {
            	child.parent = object;
					traverseWithParents(child, visitor);
            }
        }
    }
}

// Helper function for counting children of node.
function childrenLength(node)
{
	var key, child;
	var count = 0;
	for (key in node) 
	{
		if (node.hasOwnProperty(key)) 
		{
			child = node[key];
			if (typeof child === 'object' && child !== null && key != 'parent') 
			{
				count++;
			}
		}
	}	
	return count;
}


// Helper function for checking if a node is a "decision type node"
function isDecision(node)
{
	if( node.type == 'IfStatement' || node.type == 'ForStatement' || node.type == 'WhileStatement' ||
		 node.type == 'ForInStatement' || node.type == 'DoWhileStatement')
	{
		return true;
	}
	return false;
}

// Helper function for printing out function name.
function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "anon function @" + node.loc.start.line;
}

main();
exports.main = main;