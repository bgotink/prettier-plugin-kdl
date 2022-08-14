const prettier = require("prettier");
const {
	parse,
	Value,
	Identifier,
	Document,
	Node,
	Entry,
} = require("@bgotink/kdl");

const {
	doc: { builders },
} = prettier;

const plainIdentifierRe =
	/^(?![+-][0-9])[\x21\x23-\x27\x2A\x2B\x2D\x2E\x3A\x3F-\x5A\x5E-\x7A\x7C\x7E-\uFFFF][\x21\x23-\x27\x2A\x2B\x2D\x2E\x30-\x3A\x3F-\x5A\x5E-\x7A\x7C\x7E-\uFFFF]*$/;

/** @param {string} line */
function trimStart(line) {
	return line.replace(
		/^[ \t\uFEFF\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]*/,
		""
	);
}

/** @param {string} line */
function trimEnd(line) {
	return line.replace(
		/[ \t\uFEFF\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]*$/,
		""
	);
}

/** @param {string} line */
function trim(line) {
	return trimEnd(trimStart(line));
}

/**
 * @param {Value} value
 * @returns {prettier.Doc}
 */
function printValue(value) {
	const rawValue = value.value;

	switch (typeof rawValue) {
		case "object": // null
		case "boolean":
			return String(rawValue);
		case "string": {
			let numberOfHashes = 0;
			while (rawValue.includes(`"${"#".repeat(numberOfHashes)}`)) {
				numberOfHashes++;
			}

			if (numberOfHashes === 0) {
				return builders.group(['"', rawValue, '"']);
			}

			return builders.group([
				`r${"#".repeat(numberOfHashes)}"`,
				rawValue,
				`"${"#".repeat(numberOfHashes)}`,
			]);
		}
		case "number":
			return rawValue.toString();
	}
}

/**
 * @param {Identifier} identifier
 * @returns {prettier.Doc & string}
 */
function printIdentifier(identifier) {
	if (identifier.name.length === 0 || plainIdentifierRe.test(identifier.name)) {
		return identifier.name;
	}

	let numberOfHashes = 0;
	while (identifier.name.includes(`"${"#".repeat(numberOfHashes)}`)) {
		numberOfHashes++;
	}

	if (numberOfHashes === 0) {
		return `"${identifier.name}"`;
	}

	return `r${"#".repeat(numberOfHashes)}"${identifier.name}"${"#".repeat(
		numberOfHashes
	)}`;
}

/**
 * @param {Entry} entry
 * @returns {prettier.Doc}
 */
function printEntry(entry) {
	/** @type {prettier.Doc[]} */
	const parts = [];

	if (entry.name != null) {
		parts.push([printIdentifier(entry.name), "="]);
	}

	if (entry.tag != null) {
		parts.push("(", printIdentifier(entry.tag), ")");
	}

	parts.push(printValue(entry.value));

	return builders.group(parts);
}

/**
 * @param {string} text
 */
function printNodeSpace(text, {previousWasNewline = false} = {}) {
	/** @type {prettier.Doc[]} */
	const parts = [];
	let hasAddedEmptyLine = false;
  let hasAddedNonEmptyContent = previousWasNewline;
  let lastWasNewline = previousWasNewline;

	for (const whitespace of parse(text, {
		as: "whitespace in document",
	})) {
		switch (whitespace.type) {
			case "newline":
        if (lastWasNewline && hasAddedNonEmptyContent && !hasAddedEmptyLine) {
					parts.push("");
					hasAddedEmptyLine = true;
				}
        lastWasNewline = true;
				break;
			case "line-escape":
			case "space":
				break;
			case "singleline":
				parts.push(trim(whitespace.content.slice(0, -1)));
				hasAddedEmptyLine = false;
        hasAddedNonEmptyContent = true;
        lastWasNewline = true; // single-line comment implies newline
				break;
			case "multiline": {
				const lines = whitespace.content.split(
					/\x0D\x0A|[\x0A\x0C\x0D\x85\u2028\u2029]/
				);

				/** @type {prettier.Doc} */
				let comment;

				if (
					lines.length === 1 ||
					!lines.every((line, i) => i === 0 || trimStart(line).startsWith("*"))
				) {
					comment = builders.join(builders.hardline, lines);
				} else {
					comment = builders.join(builders.hardline, [
						trimStart(lines[0]),
						...lines.slice(1).map((line) => ` ${trimStart(line)}`),
					]);
				}

				parts.push(comment);
				hasAddedEmptyLine = false;
        hasAddedNonEmptyContent = true;
        lastWasNewline = false;
				break;
			}
			case "slashdash":
				parts.push([
					"/-",
					printNode(parse(whitespace.content.slice(2), { as: "node" })),
				]);
				hasAddedEmptyLine = false;
        hasAddedNonEmptyContent = true;
        lastWasNewline = false;
				break;
		}
	}

	return parts;
}

/**
 * @param {Node} node
 * @returns {prettier.Doc}
 */
function printNode(node, isFirstNode = false) {
	let name = printIdentifier(node.name);
	if (node.tag) {
		name = `(${printIdentifier(node.tag)})${name}`;
	}
	const nameAlign = prettier.util.getStringWidth(name) + 1;

	/** @type {prettier.Doc[][]} */
	const header = [];
	/** @type {prettier.Doc[]} */
	let lastHeaderItem = [];
	const continuation = builders.ifBreak(" \\");

	/** @param {string} text */
	function addCommentToHeader(text) {
		for (const whitespace of parse(text, {
			as: "whitespace in node",
		})) {
			switch (whitespace.type) {
				case "newline":
				case "line-escape":
				case "space":
					break;
				case "singleline":
					lastHeaderItem.push(continuation);
					lastHeaderItem = [];
					header.push([
						builders.breakParent,
						`\\ ${trim(whitespace.content.slice(0, -1))}`,
					]);
					break;
				case "slashdash":
					lastHeaderItem.push(continuation);
					header.push(
						(lastHeaderItem = [
							"/-",
							printEntry(parse(whitespace.content.slice(2), { as: "entry" })),
						])
					);
					break;
				case "multiline": {
					const lines = whitespace.content.split(
						/\x0D\x0A|[\x0A\x0C\x0D\x85\u2028\u2029]/
					);

					/** @type {prettier.Doc} */
					let comment;

					if (
						lines.length === 1 ||
						!lines.every(
							(line, i) => i === 0 || trimStart(line).startsWith("*")
						)
					) {
						comment = builders.join(builders.hardlineWithoutBreakParent, lines);
					} else {
						comment = builders.join(builders.hardlineWithoutBreakParent, [
							trim(lines[0]),
							...lines.slice(1).map((line) => ` ${trim(line)}`),
						]);
					}

					lastHeaderItem.push(continuation);
					header.push((lastHeaderItem = [comment]));
				}
			}
		}
	}

	for (const entry of node.entries) {
		if (entry.leading) {
			addCommentToHeader(entry.leading);
		}

		lastHeaderItem.push(continuation);
		header.push((lastHeaderItem = [printEntry(entry)]));
	}

	if (node.beforeChildren) {
		addCommentToHeader(node.beforeChildren);
	}

	/** @type {prettier.Doc[]} */
	const parts = [];

	if (node.leading) {
		// Nodes always end on a newline after we printed them, because we
		// (currently) don't ever print multiple nodes with just `;` in between
		parts.push(...printNodeSpace(node.leading, {previousWasNewline: !isFirstNode}));
	}

	if (!node.hasChildren() && !node.children?.trailing) {
		if (node.children != null) {
			lastHeaderItem.push(continuation);
			header.push(["{}"]);
		}

		const joinedHeader = builders.join(builders.line, header);
		parts.push(
			builders.group([
				name,
				continuation,
				builders.ifBreak(
					builders.align(nameAlign, [builders.line, joinedHeader]),
					[builders.line, joinedHeader]
				),
			])
		);
	} else {
		lastHeaderItem.push(continuation);
		header.push(["{"]);

		const joinedHeader = builders.join(builders.line, header);
		parts.push([
			builders.group([
				name,
				continuation,
				builders.ifBreak(
					builders.align(nameAlign, [builders.line, joinedHeader]),
					[builders.line, joinedHeader]
				),
			]),
			builders.indent([
				builders.hardline,
				printDocument(/** @type {Document} */ (node.children)),
			]),
			builders.hardline,
			"}",
		]);
	}

	if (node.trailing) {
		let trailing = node.trailing;
		if (trailing.endsWith(";")) {
			trailing = trailing.slice(0, -1);
		}
		parts.push(...printNodeSpace(trailing));
	}

	return builders.join(builders.hardline, parts);
}

/**
 * @param {Document} document
 * @returns {prettier.Doc}
 */
function printDocument(document) {
	const nodes = document.nodes.map((node, i) => printNode(node, i === 0));

	/** @type {prettier.Doc[]} */
	let trailing = [];

	if (document.trailing) {
		trailing.push(...printNodeSpace(document.trailing));
	}

	return builders.join(builders.hardline, [
		builders.join(builders.hardline, nodes),
		...trailing,
	]);
}

/**
 * @type {prettier.Printer<Document>}
 */
exports.printer = {
	print: (path) => {
		return [printDocument(path.getValue()), builders.hardline];
	},
};
