import { test } from "uvu";
import * as assert from "uvu/assert";
import { format, util } from "prettier";

const { getStringWidth } = util;

import p from "../src/index.js";

const plugin = /** @type {import('prettier').Plugin} */ (p);

/**
 * @param {TemplateStringsArray} tpl
 */
function trim(tpl) {
	const lines = tpl.raw[0].split("\n");

	let indentation = Infinity;

	if (!lines[0].trim()) {
		lines.shift();
	}

	for (let line of lines) {
		if (!line.trim()) {
			continue;
		}

		let match = /^\s+/.exec(line);
		if (match) {
			indentation = Math.min(indentation, getStringWidth(match[0]));
		}
	}

	if (!Number.isFinite(indentation)) {
		return lines.join("\n");
	}

	return lines
		.map((line) => (/^\s/.test(line) ? line.slice(indentation) : line))
		.join("\n");
}

// Using a tag function called raw tells VS Code not to try to highlight the
// string's content as if it's a regular javascript string
trim.raw = trim;

test("collapse lines", async () => {
	assert.is(
		await format(
			trim.raw`
        "node" "prop"=#true\
              ##"arg"## #false 2e3\
              {



                child;
        }
      `,
			{
				parser: "kdl",
				plugins: [plugin],
			},
		),
		trim.raw`
      node prop=#true "arg" #false 2000 {
        child
      }
    `,
	);
});

test("tags", async () => {
	assert.is(
		await format(
			trim.raw`
        ("tag")node "prop"=("tag")#true ("ta\"g")#false
      `,
			{
				parser: "kdl",
				plugins: [plugin],
			},
		),
		trim.raw`
      (tag)node prop=(tag)#true (#"ta"g"#)#false
    `,
	);
});

test("long line", async () => {
	assert.is(
		await format(
			trim.raw`
        "node" "prop"=#true\
                          ##"arg"## #false 2e3 "arg" "arg" "arg" "arg" "arg" "arg" "arg" "arg" "arg"
      `,
			{
				parser: "kdl",
				plugins: [plugin],
			},
		),
		trim.raw`
      node \
           prop=#true \
           "arg" \
           #false \
           2000 \
           "arg" \
           "arg" \
           "arg" \
           "arg" \
           "arg" \
           "arg" \
           "arg" \
           "arg" \
           "arg"
    `,
	);

	assert.is(
		await format(
			trim.raw`
				node "single argument" prop1=#false prop2=2e3 prop3="arg" prop4="arg" prop5="arg" prop6="arg"
			`,
			{
				parser: "kdl",
				plugins: [plugin],
			},
		),
		trim.raw`
      node "single argument" \
           prop1=#false \
           prop2=2000 \
           prop3="arg" \
           prop4="arg" \
           prop5="arg" \
           prop6="arg"
		`,
	);
});

test("comments", async () => {
	assert.is(
		await format(
			trim.raw`
        // lookie here, a comment
        /*
            * moar comments
         */
        /-commented   "node";

        "not commented node" \
        /-"commented arg" {

          // comment inside
          child;

          // other comment inside
          other_child

          third_child
        }
      `,
			{
				parser: "kdl",
				plugins: [plugin],
			},
		),
		trim.raw`
      // lookie here, a comment
      /*
       * moar comments
       */
      /-commented "node"

      "not commented node" /-"commented arg" {
        // comment inside
        child

        // other comment inside
        other_child

        third_child
      }
    `,
	);
});

test.run();
