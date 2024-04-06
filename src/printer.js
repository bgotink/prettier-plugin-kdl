import { parse, Value, Identifier, Document, Node, Entry } from "@bgotink/kdl";
import { util, doc } from "prettier";

/** @typedef {import('prettier').Doc} Doc */

const { builders } = doc;
const { getStringWidth } = util;

const plainIdentifierRe =
	/^(?![+-][0-9])[\x21\x23-\x27\x2A\x2B\x2D\x2E\x3A\x3F-\x5A\x5E-\x7A\x7C\x7E-\uFFFF][\x21\x23-\x27\x2A\x2B\x2D\x2E\x30-\x3A\x3F-\x5A\x5E-\x7A\x7C\x7E-\uFFFF]*$/;

const reservedIdentifiers = new Set([
	"inf",
	"-inf",
	"nan",
	"true",
	"false",
	"null",
]);

/** @param {string} line */
function trimStart(line) {
	return line.replace(
		/^[ \t\uFEFF\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]*/,
		"",
	);
}

/** @param {string} line */
function trimEnd(line) {
	return line.replace(
		/[ \t\uFEFF\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]*$/,
		"",
	);
}

/** @param {string} line */
function trim(line) {
	return trimEnd(trimStart(line));
}

/**
 * @param {Value} value
 * @returns {Doc & string}
 */
function printValue(value) {
	const rawValue = value.value;

	switch (typeof rawValue) {
		case "object": // null
		case "boolean":
			return `#${rawValue}`;
		case "string": {
			let numberOfHashes = 0;
			while (rawValue.includes(`"${"#".repeat(numberOfHashes)}`)) {
				numberOfHashes++;
			}

			if (numberOfHashes === 0) {
				return JSON.stringify(rawValue);
			}

			return `${"#".repeat(numberOfHashes)}"${rawValue}"${"#".repeat(
				numberOfHashes,
			)}`;
		}
		case "number":
			if (Number.isNaN(rawValue)) {
				return "#nan";
			} else if (!Number.isFinite(rawValue)) {
				return rawValue < 0 ? "#-inf" : "#inf";
			} else {
				return rawValue.toString();
			}
	}
}

/**
 * @param {Pick<Identifier, 'name'>} identifier
 * @returns {Doc & string}
 */
function printIdentifier(identifier) {
	if (
		identifier.name.length > 0 &&
		!reservedIdentifiers.has(identifier.name) &&
		plainIdentifierRe.test(identifier.name)
	) {
		return identifier.name;
	}

	let numberOfHashes = 0;
	while (identifier.name.includes(`"${"#".repeat(numberOfHashes)}`)) {
		numberOfHashes++;
	}

	if (numberOfHashes === 0) {
		return `"${identifier.name}"`;
	}

	return `${"#".repeat(numberOfHashes)}"${identifier.name}"${"#".repeat(
		numberOfHashes,
	)}`;
}

/**
 * @param {Entry} entry
 * @returns {Doc & string}
 */
function printEntry(entry) {
	/** @type {string[]} */
	const parts = [];

	if (entry.name != null) {
		parts.push(printIdentifier(entry.name), entry.equals ?? "=");
	}

	if (entry.tag != null) {
		parts.push(
			"(",
			trim(entry.tag.leading ?? ""),
			printIdentifier(entry.tag),
			trim(entry.tag.trailing ?? ""),
			")",
			trim(entry.betweenTagAndValue ?? ""),
		);
	}

	parts.push(printValue(entry.value));

	return parts.join("");
}

/**
 * @param {string} text
 */
function printLineSpace(text, { previousWasNewline = false } = {}) {
	/** @type {Doc[]} */
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
			case "space":
				break;
			case "singleline":
				parts.push(trim(whitespace.text.slice(0, -1)));
				hasAddedEmptyLine = false;
				hasAddedNonEmptyContent = true;
				lastWasNewline = true; // single-line comment implies newline
				break;
			case "multiline": {
				const lines = whitespace.text.split(
					/\x0D\x0A|[\x0A\x0C\x0D\x85\u2028\u2029]/,
				);

				/** @type {Doc} */
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
				parts.push(["/-", printNode(whitespace.value)]);
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
 * @returns {Doc}
 */
function printNode(node, isFirstNode = false) {
	let name = printIdentifier(node.name);
	if (node.tag) {
		name = `(${trim(node.tag.leading ?? "")}${printIdentifier(node.tag)}${trim(node.tag.trailing ?? "")})${trim(node.betweenTagAndName ?? "")}${name}`;
	}
	const nameAlign = getStringWidth(name) + 1;

	/** @type {Doc[][]} */
	const header = [];
	/** @type {Doc[]} */
	let lastHeaderItem = [];
	const continuation = builders.ifBreak(" \\");

	/** @param {string} text */
	function addCommentToHeader(text) {
		for (const whitespace of parse(text, {
			as: "whitespace in node",
		})) {
			switch (whitespace.type) {
				case "space":
					break;
				case "line-escape":
					{
						for (const nestedWhitespace of parse(whitespace.text.slice(1), {
							as: "whitespace in document",
						})) {
							switch (nestedWhitespace.type) {
								case "multiline":
									const lines = whitespace.text.split(
										/\x0D\x0A|[\x0A\x0C\x0D\x85\u2028\u2029]/,
									);

									/** @type {Doc} */
									let comment;

									if (
										lines.length === 1 ||
										!lines.every(
											(line, i) => i === 0 || trimStart(line).startsWith("*"),
										)
									) {
										comment = builders.join(
											builders.hardlineWithoutBreakParent,
											lines,
										);
									} else {
										comment = builders.join(
											builders.hardlineWithoutBreakParent,
											[
												trim(lines[0]),
												...lines.slice(1).map((line) => ` ${trim(line)}`),
											],
										);
									}

									lastHeaderItem.push(continuation);
									header.push((lastHeaderItem = [comment]));
								case "singleline":
								case "singleline":
									lastHeaderItem.push(continuation);
									lastHeaderItem = [];
									header.push([
										builders.breakParent,
										`\\ ${trim(nestedWhitespace.text.slice(0, -1))}`,
									]);
									break;

								default:
								// do nothing
							}
						}
					}

					break;
				case "slashdash":
					lastHeaderItem.push(continuation);
					header.push(
						(lastHeaderItem = [
							"/-",
							whitespace.value instanceof Entry
								? printEntry(whitespace.value)
								: ["{", printDocument(whitespace.value), "}"],
						]),
					);
					break;
				case "multiline": {
					const lines = whitespace.text.split(
						/\x0D\x0A|[\x0A\x0C\x0D\x85\u2028\u2029]/,
					);

					/** @type {Doc} */
					let comment;

					if (
						lines.length === 1 ||
						!lines.every(
							(line, i) => i === 0 || trimStart(line).startsWith("*"),
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

	const entries = Array.from(node.entries);
	const argEntries = node.getArgumentEntries();

	if (
		argEntries.length === 1 &&
		entries[0] === argEntries[0] &&
		(!argEntries[0].leading || !trim(argEntries[0].leading))
	) {
		entries.shift();

		name = `${name} ${printEntry(argEntries[0])}`;
	}

	for (const entry of entries) {
		if (entry.leading) {
			addCommentToHeader(entry.leading);
		}

		lastHeaderItem.push(continuation);
		header.push((lastHeaderItem = [printEntry(entry)]));
	}

	if (node.beforeChildren) {
		addCommentToHeader(node.beforeChildren);
	}

	/** @type {Doc[]} */
	const parts = [];

	if (node.leading) {
		// Nodes always end on a newline after we printed them, because we
		// (currently) don't ever print multiple nodes with just `;` in between
		parts.push(
			...printLineSpace(node.leading, { previousWasNewline: !isFirstNode }),
		);
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
					[builders.line, joinedHeader],
				),
			]),
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
					[builders.line, joinedHeader],
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
		parts.push(...printLineSpace(trailing));
	}

	return builders.join(builders.hardline, parts);
}

/**
 * @param {Document} document
 * @returns {Doc}
 */
function printDocument(document) {
	const nodes = document.nodes.map((node, i) => printNode(node, i === 0));

	/** @type {Doc[]} */
	let trailing = [];

	if (document.trailing) {
		trailing.push(...printLineSpace(document.trailing));
	}

	return builders.join(builders.hardline, [
		builders.join(builders.hardline, nodes),
		...trailing,
	]);
}

/**
 * @type {import('prettier').Printer<Document>}
 */
export const printer = {
	print: (path) => {
		return [printDocument(path.getValue()), builders.hardline];
	},
};
