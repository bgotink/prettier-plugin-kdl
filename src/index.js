const { parse, getLocation } = require("@bgotink/kdl");

const { printer } = require("./printer.js");

/** @type {import('prettier').Plugin} */
const plugin = {
	languages: [
		{
			name: "kdl",
			aliases: ["kdl", "KDL"],
			extensions: [".kdl"],
			parsers: ["kdl"],
			tmScope: "source.kdl",
		},
	],
	parsers: {
		kdl: {
			astFormat: "kdl",
			parse(text) {
				return parse(text, { storeLocations: true });
			},

			locStart(node) {
				return /** @type {import('@bgotink/kdl').Location} */ (
					getLocation(node)
				).startOffset;
			},
			locEnd(node) {
				return /** @type {import('@bgotink/kdl').Location} */ (
					getLocation(node)
				).endOffset;
			},
		},
	},

	printers: { kdl: printer },
};

module.exports = plugin;
