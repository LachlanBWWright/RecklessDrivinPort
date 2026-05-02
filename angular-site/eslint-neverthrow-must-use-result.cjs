"use strict";

const { unionTypeParts } = require("tsutils");
const { MessageIds } = require("eslint-plugin-neverthrow/dist/src/utils");

function matchAny(nodeTypes) {
  return `:matches(${nodeTypes.join(", ")})`;
}

const resultSelector = matchAny(["CallExpression", "NewExpression"]);
const resultProperties = ["mapErr", "map", "andThen", "orElse", "match", "unwrapOr"];
const handledMethods = ["match", "unwrapOr", "_unsafeUnwrap"];
const endTransverse = ["BlockStatement", "Program"];
const ignoreParents = ["ClassDeclaration", "FunctionDeclaration", "MethodDefinition", "ClassProperty"];

function isResultLike(checker, parserServices, node) {
  if (!node) return false;
  const tsNodeMap = parserServices.esTreeNodeToTSNodeMap.get(node);
  const type = checker.getTypeAtLocation(tsNodeMap);
  for (const ty of unionTypeParts(checker.getApparentType(type))) {
    if (resultProperties.map((property) => ty.getProperty(property)).every((property) => property !== undefined)) {
      return true;
    }
  }
  return false;
}

function findMemberName(node) {
  if (!node || node.property.type !== "Identifier") return null;
  return node.property.name;
}

function isMemberCalledFn(node) {
  return node?.parent?.type === "CallExpression" && node.parent.callee === node;
}

function isHandledResult(node) {
  const memberExpression = node.parent;
  if (memberExpression?.type === "MemberExpression") {
    const methodName = findMemberName(memberExpression);
    const methodIsCalled = isMemberCalledFn(memberExpression);
    if (methodName && handledMethods.includes(methodName) && methodIsCalled) {
      return true;
    }
    const parent = node.parent?.parent;
    if (parent && parent.type !== "ExpressionStatement") {
      return isHandledResult(parent);
    }
  }
  return false;
}

function getAssignation(checker, parserServices, node) {
  if (
    node.type === "VariableDeclarator" &&
    isResultLike(checker, parserServices, node.init) &&
    node.id.type === "Identifier"
  ) {
    return node.id;
  }
  if (endTransverse.includes(node.type) || !node.parent) {
    return undefined;
  }
  return getAssignation(checker, parserServices, node.parent);
}

function isReturned(_checker, _parserServices, node) {
  if (node.type === "ArrowFunctionExpression" || node.type === "ReturnStatement") {
    return true;
  }
  if (node.type === "BlockStatement" || node.type === "Program" || !node.parent) {
    return false;
  }
  return isReturned(_checker, _parserServices, node.parent);
}

function processSelector(context, checker, parserServices, node, reportAs = node) {
  if (node.parent?.type.startsWith("TS")) return false;
  if (node.parent && ignoreParents.includes(node.parent.type)) return false;
  if (!isResultLike(checker, parserServices, node)) return false;
  if (isHandledResult(node)) return false;
  if (isReturned(checker, parserServices, node)) return false;

  const assignedTo = getAssignation(checker, parserServices, node);
  const currentScope = context.sourceCode.getScope(node);
  if (assignedTo) {
    const variable = currentScope.set.get(assignedTo.name);
    const references = variable?.references.filter((ref) => ref.identifier !== assignedTo) ?? [];
    if (references.length > 0) {
      return references.some((ref) => processSelector(context, checker, parserServices, ref.identifier, reportAs));
    }
  }

  context.report({
    node: reportAs,
    messageId: MessageIds.MUST_USE,
  });
  return true;
}

module.exports = {
  meta: {
    docs: {
      description: "Not handling neverthrow result is a possible error because errors could remain unhandleds.",
      recommended: "error",
      category: "Possible Errors",
      url: "",
    },
    messages: {
      mustUseResult: "Result must be handled with either of match, unwrapOr or _unsafeUnwrap.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    const parserServices = context.sourceCode?.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker();
    if (!checker || !parserServices) {
      throw Error("types not available, maybe you need set the parser to @typescript-eslint/parser");
    }
    return {
      [resultSelector](node) {
        return processSelector(context, checker, parserServices, node);
      },
    };
  },
};
