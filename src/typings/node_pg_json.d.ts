// Some helpers for ourselves to get serialized values from node pgs serialize and deserialize
type NodePgJsonPrimitive = Date | string | number | boolean | null | undefined;
type NodePgJsonArray = NodePgJsonValue[];
type NodePgJsonObject = { [key: string]: NodePgJsonValue };
export type NodePgJsonValue = NodePgJsonPrimitive | NodePgJsonObject | NodePgJsonArray;
export type NodePgJsonSerialized<T extends NodePgJsonValue> = T extends Date
    ? string
    : T extends NodePgJsonPrimitive
        ? T
        : T extends NodePgJsonArray
            ? NodePgJsonSerialized<T[number]>[]
            : T extends NodePgJsonObject
                ? { [K in keyof T]: NodePgJsonSerialized<T[K]> }
                : never;
