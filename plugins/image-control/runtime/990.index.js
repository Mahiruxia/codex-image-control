export const id = 990;
export const ids = [990];
export const modules = {

/***/ 990:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  z: () => (/* reexport */ external_namespaceObject)
});

// UNUSED EXPORTS: $brand, $input, $output, NEVER, TimePrecision, ZodAny, ZodArray, ZodBase64, ZodBase64URL, ZodBigInt, ZodBigIntFormat, ZodBoolean, ZodCIDRv4, ZodCIDRv6, ZodCUID, ZodCUID2, ZodCatch, ZodCustom, ZodCustomStringFormat, ZodDate, ZodDefault, ZodDiscriminatedUnion, ZodE164, ZodEmail, ZodEmoji, ZodEnum, ZodError, ZodFile, ZodGUID, ZodIPv4, ZodIPv6, ZodISODate, ZodISODateTime, ZodISODuration, ZodISOTime, ZodIntersection, ZodIssueCode, ZodJWT, ZodKSUID, ZodLazy, ZodLiteral, ZodMap, ZodNaN, ZodNanoID, ZodNever, ZodNonOptional, ZodNull, ZodNullable, ZodNumber, ZodNumberFormat, ZodObject, ZodOptional, ZodPipe, ZodPrefault, ZodPromise, ZodReadonly, ZodRealError, ZodRecord, ZodSet, ZodString, ZodStringFormat, ZodSuccess, ZodSymbol, ZodTemplateLiteral, ZodTransform, ZodTuple, ZodType, ZodULID, ZodURL, ZodUUID, ZodUndefined, ZodUnion, ZodUnknown, ZodVoid, ZodXID, _ZodString, _default, any, array, base64, base64url, bigint, boolean, catch, check, cidrv4, cidrv6, clone, coerce, config, core, cuid, cuid2, custom, date, default, discriminatedUnion, e164, email, emoji, endsWith, enum, file, flattenError, float32, float64, formatError, function, getErrorMap, globalRegistry, gt, gte, guid, includes, instanceof, int, int32, int64, intersection, ipv4, ipv6, iso, json, jwt, keyof, ksuid, lazy, length, literal, locales, looseObject, lowercase, lt, lte, map, maxLength, maxSize, mime, minLength, minSize, multipleOf, nan, nanoid, nativeEnum, negative, never, nonnegative, nonoptional, nonpositive, normalize, null, nullable, nullish, number, object, optional, overwrite, parse, parseAsync, partialRecord, pipe, positive, prefault, preprocess, prettifyError, promise, property, readonly, record, refine, regex, regexes, registry, safeParse, safeParseAsync, set, setErrorMap, size, startsWith, strictObject, string, stringFormat, stringbool, success, superRefine, symbol, templateLiteral, toJSONSchema, toLowerCase, toUpperCase, transform, treeifyError, trim, tuple, uint32, uint64, ulid, undefined, union, unknown, uppercase, url, uuid, uuidv4, uuidv6, uuidv7, void, xid

// NAMESPACE OBJECT: ./node_modules/zod/v4/locales/index.js
var locales_namespaceObject = {};
__webpack_require__.r(locales_namespaceObject);
__webpack_require__.d(locales_namespaceObject, {
  ar: () => (ar),
  az: () => (az),
  be: () => (be),
  ca: () => (ca),
  cs: () => (cs),
  de: () => (de),
  en: () => (en),
  eo: () => (eo),
  es: () => (es),
  fa: () => (fa),
  fi: () => (fi),
  fr: () => (fr),
  frCA: () => (fr_CA),
  he: () => (he),
  hu: () => (hu),
  id: () => (id),
  it: () => (it),
  ja: () => (ja),
  kh: () => (kh),
  ko: () => (ko),
  mk: () => (mk),
  ms: () => (ms),
  nl: () => (nl),
  no: () => (no),
  ota: () => (ota),
  pl: () => (pl),
  ps: () => (ps),
  pt: () => (pt),
  ru: () => (ru),
  sl: () => (sl),
  sv: () => (sv),
  ta: () => (ta),
  th: () => (th),
  tr: () => (tr),
  ua: () => (ua),
  ur: () => (ur),
  vi: () => (vi),
  zhCN: () => (zh_CN),
  zhTW: () => (zh_TW)
});

// NAMESPACE OBJECT: ./node_modules/zod/v4/core/json-schema.js
var json_schema_namespaceObject = {};
__webpack_require__.r(json_schema_namespaceObject);

// NAMESPACE OBJECT: ./node_modules/zod/v4/core/index.js
var core_namespaceObject = {};
__webpack_require__.r(core_namespaceObject);
__webpack_require__.d(core_namespaceObject, {
  $ZodAny: () => (schemas/* $ZodAny */.Gb),
  $ZodArray: () => (schemas/* $ZodArray */.$p),
  $ZodAsyncError: () => (core/* $ZodAsyncError */.GT),
  $ZodBase64: () => (schemas/* $ZodBase64 */.Dq),
  $ZodBase64URL: () => (schemas/* $ZodBase64URL */.CQ),
  $ZodBigInt: () => (schemas/* $ZodBigInt */.BN),
  $ZodBigIntFormat: () => (schemas/* $ZodBigIntFormat */.IT),
  $ZodBoolean: () => (schemas/* $ZodBoolean */.sF),
  $ZodCIDRv4: () => (schemas/* $ZodCIDRv4 */.CI),
  $ZodCIDRv6: () => (schemas/* $ZodCIDRv6 */.Cn),
  $ZodCUID: () => (schemas/* $ZodCUID */.bl),
  $ZodCUID2: () => (schemas/* $ZodCUID2 */.Zu),
  $ZodCatch: () => (schemas/* $ZodCatch */.t$),
  $ZodCheck: () => (checks/* $ZodCheck */.QP),
  $ZodCheckBigIntFormat: () => (checks/* $ZodCheckBigIntFormat */.uE),
  $ZodCheckEndsWith: () => (checks/* $ZodCheckEndsWith */.E6),
  $ZodCheckGreaterThan: () => (checks/* $ZodCheckGreaterThan */.J_),
  $ZodCheckIncludes: () => (checks/* $ZodCheckIncludes */.Tt),
  $ZodCheckLengthEquals: () => (checks/* $ZodCheckLengthEquals */.RM),
  $ZodCheckLessThan: () => (checks/* $ZodCheckLessThan */.sm),
  $ZodCheckLowerCase: () => (checks/* $ZodCheckLowerCase */.NI),
  $ZodCheckMaxLength: () => (checks/* $ZodCheckMaxLength */.Yk),
  $ZodCheckMaxSize: () => (checks/* $ZodCheckMaxSize */.j2),
  $ZodCheckMimeType: () => (checks/* $ZodCheckMimeType */.sj),
  $ZodCheckMinLength: () => (checks/* $ZodCheckMinLength */.Kk),
  $ZodCheckMinSize: () => (checks/* $ZodCheckMinSize */.PH),
  $ZodCheckMultipleOf: () => (checks/* $ZodCheckMultipleOf */.Jk),
  $ZodCheckNumberFormat: () => (checks/* $ZodCheckNumberFormat */.KH),
  $ZodCheckOverwrite: () => (checks/* $ZodCheckOverwrite */.v$),
  $ZodCheckProperty: () => (checks/* $ZodCheckProperty */.XF),
  $ZodCheckRegex: () => (checks/* $ZodCheckRegex */.DG),
  $ZodCheckSizeEquals: () => (checks/* $ZodCheckSizeEquals */.e2),
  $ZodCheckStartsWith: () => (checks/* $ZodCheckStartsWith */.J),
  $ZodCheckStringFormat: () => (checks/* $ZodCheckStringFormat */.ql),
  $ZodCheckUpperCase: () => (checks/* $ZodCheckUpperCase */.kH),
  $ZodCustom: () => (schemas/* $ZodCustom */.b0),
  $ZodCustomStringFormat: () => (schemas/* $ZodCustomStringFormat */.ZQ),
  $ZodDate: () => (schemas/* $ZodDate */.o5),
  $ZodDefault: () => (schemas/* $ZodDefault */.rv),
  $ZodDiscriminatedUnion: () => (schemas/* $ZodDiscriminatedUnion */.P0),
  $ZodE164: () => (schemas/* $ZodE164 */.Oy),
  $ZodEmail: () => (schemas/* $ZodEmail */.qG),
  $ZodEmoji: () => (schemas/* $ZodEmoji */.cG),
  $ZodEnum: () => (schemas/* $ZodEnum */.VO),
  $ZodError: () => (errors/* $ZodError */.a$),
  $ZodFile: () => (schemas/* $ZodFile */.CT),
  $ZodFunction: () => ($ZodFunction),
  $ZodGUID: () => (schemas/* $ZodGUID */.Zc),
  $ZodIPv4: () => (schemas/* $ZodIPv4 */.Lc),
  $ZodIPv6: () => (schemas/* $ZodIPv6 */.Zy),
  $ZodISODate: () => (schemas/* $ZodISODate */.v1),
  $ZodISODateTime: () => (schemas/* $ZodISODateTime */.Ko),
  $ZodISODuration: () => (schemas/* $ZodISODuration */.$N),
  $ZodISOTime: () => (schemas/* $ZodISOTime */.Ax),
  $ZodIntersection: () => (schemas/* $ZodIntersection */.LJ),
  $ZodJWT: () => (schemas/* $ZodJWT */.h8),
  $ZodKSUID: () => (schemas/* $ZodKSUID */.GY),
  $ZodLazy: () => (schemas/* $ZodLazy */.kU),
  $ZodLiteral: () => (schemas/* $ZodLiteral */.nu),
  $ZodMap: () => (schemas/* $ZodMap */.eb),
  $ZodNaN: () => (schemas/* $ZodNaN */.zP),
  $ZodNanoID: () => (schemas/* $ZodNanoID */.Py),
  $ZodNever: () => (schemas/* $ZodNever */.Um),
  $ZodNonOptional: () => (schemas/* $ZodNonOptional */.N$),
  $ZodNull: () => (schemas/* $ZodNull */.x8),
  $ZodNullable: () => (schemas/* $ZodNullable */.qc),
  $ZodNumber: () => (schemas/* $ZodNumber */.vz),
  $ZodNumberFormat: () => (schemas/* $ZodNumberFormat */.I),
  $ZodObject: () => (schemas/* $ZodObject */.L8),
  $ZodOptional: () => (schemas/* $ZodOptional */.ig),
  $ZodPipe: () => (schemas/* $ZodPipe */._m),
  $ZodPrefault: () => (schemas/* $ZodPrefault */.VF),
  $ZodPromise: () => (schemas/* $ZodPromise */.hA),
  $ZodReadonly: () => (schemas/* $ZodReadonly */.Sb),
  $ZodRealError: () => (errors/* $ZodRealError */.Kd),
  $ZodRecord: () => (schemas/* $ZodRecord */.h),
  $ZodRegistry: () => (registries/* $ZodRegistry */.rs),
  $ZodSet: () => (schemas/* $ZodSet */.Oi),
  $ZodString: () => (schemas/* $ZodString */.$v),
  $ZodStringFormat: () => (schemas/* $ZodStringFormat */.EY),
  $ZodSuccess: () => (schemas/* $ZodSuccess */.Dw),
  $ZodSymbol: () => (schemas/* $ZodSymbol */.U5),
  $ZodTemplateLiteral: () => (schemas/* $ZodTemplateLiteral */.d),
  $ZodTransform: () => (schemas/* $ZodTransform */.Wc),
  $ZodTuple: () => (schemas/* $ZodTuple */.G3),
  $ZodType: () => (schemas/* $ZodType */.W4),
  $ZodULID: () => (schemas/* $ZodULID */.g5),
  $ZodURL: () => (schemas/* $ZodURL */.VY),
  $ZodUUID: () => (schemas/* $ZodUUID */.Zn),
  $ZodUndefined: () => (schemas/* $ZodUndefined */.Mv),
  $ZodUnion: () => (schemas/* $ZodUnion */.cu),
  $ZodUnknown: () => (schemas/* $ZodUnknown */.GP),
  $ZodVoid: () => (schemas/* $ZodVoid */.WH),
  $ZodXID: () => (schemas/* $ZodXID */.TF),
  $brand: () => (core/* $brand */._e),
  $constructor: () => (core/* $constructor */.xI),
  $input: () => (registries/* $input */.nP),
  $output: () => (registries/* $output */.UY),
  Doc: () => (doc/* Doc */.J),
  JSONSchema: () => (json_schema_namespaceObject),
  JSONSchemaGenerator: () => (to_json_schema/* JSONSchemaGenerator */.L),
  NEVER: () => (core/* NEVER */.tm),
  TimePrecision: () => (api/* TimePrecision */.So),
  _any: () => (api/* _any */.KA),
  _array: () => (api/* _array */.dZ),
  _base64: () => (api/* _base64 */.rt),
  _base64url: () => (api/* _base64url */.cU),
  _bigint: () => (api/* _bigint */.z$),
  _boolean: () => (api/* _boolean */._L),
  _catch: () => (api/* _catch */.nb),
  _cidrv4: () => (api/* _cidrv4 */.Uy),
  _cidrv6: () => (api/* _cidrv6 */.gP),
  _coercedBigint: () => (api/* _coercedBigint */.St),
  _coercedBoolean: () => (api/* _coercedBoolean */.dN),
  _coercedDate: () => (api/* _coercedDate */.B4),
  _coercedNumber: () => (api/* _coercedNumber */.qG),
  _coercedString: () => (api/* _coercedString */.K_),
  _cuid: () => (api/* _cuid */.fs),
  _cuid2: () => (api/* _cuid2 */.Bj),
  _custom: () => (api/* _custom */.FO),
  _date: () => (api/* _date */.YY),
  _default: () => (api/* _default */.Rv),
  _discriminatedUnion: () => (api/* _discriminatedUnion */.FG),
  _e164: () => (api/* _e164 */.KB),
  _email: () => (api/* _email */.Mu),
  _emoji: () => (api/* _emoji */.aC),
  _endsWith: () => (api/* _endsWith */.ER),
  _enum: () => (api/* _enum */.$8),
  _file: () => (api/* _file */.K2),
  _float32: () => (api/* _float32 */.HL),
  _float64: () => (api/* _float64 */.g6),
  _gt: () => (api/* _gt */.Tx),
  _gte: () => (api/* _gte */.qm),
  _guid: () => (api/* _guid */.tB),
  _includes: () => (api/* _includes */.dR),
  _int: () => (api/* _int */.LK),
  _int32: () => (api/* _int32 */.sw),
  _int64: () => (api/* _int64 */.Jg),
  _intersection: () => (api/* _intersection */.tj),
  _ipv4: () => (api/* _ipv4 */.Ny),
  _ipv6: () => (api/* _ipv6 */.$O),
  _isoDate: () => (api/* _isoDate */.db),
  _isoDateTime: () => (api/* _isoDateTime */.G1),
  _isoDuration: () => (api/* _isoDuration */.f2),
  _isoTime: () => (api/* _isoTime */.Kn),
  _jwt: () => (api/* _jwt */.rk),
  _ksuid: () => (api/* _ksuid */._z),
  _lazy: () => (api/* _lazy */.kx),
  _length: () => (api/* _length */.YA),
  _literal: () => (api/* _literal */.rn),
  _lowercase: () => (api/* _lowercase */.hH),
  _lt: () => (api/* _lt */.Au),
  _lte: () => (api/* _lte */.Zm),
  _map: () => (api/* _map */.rF),
  _max: () => (api/* _max */.Yv),
  _maxLength: () => (api/* _maxLength */.Eb),
  _maxSize: () => (api/* _maxSize */.vL),
  _mime: () => (api/* _mime */.GZ),
  _min: () => (api/* _min */.Q_),
  _minLength: () => (api/* _minLength */.m9),
  _minSize: () => (api/* _minSize */.Nd),
  _multipleOf: () => (api/* _multipleOf */.Hi),
  _nan: () => (api/* _nan */.L4),
  _nanoid: () => (api/* _nanoid */.Dl),
  _nativeEnum: () => (api/* _nativeEnum */.Un),
  _negative: () => (api/* _negative */.bR),
  _never: () => (api/* _never */.G8),
  _nonnegative: () => (api/* _nonnegative */.UI),
  _nonoptional: () => (api/* _nonoptional */.v$),
  _nonpositive: () => (api/* _nonpositive */.ej),
  _normalize: () => (api/* _normalize */.lo),
  _null: () => (api/* _null */.jw),
  _nullable: () => (api/* _nullable */.jS),
  _number: () => (api/* _number */.F7),
  _optional: () => (api/* _optional */.oI),
  _overwrite: () => (api/* _overwrite */.bS),
  _parse: () => (parse/* _parse */.Tj),
  _parseAsync: () => (parse/* _parseAsync */.Rb),
  _pipe: () => (api/* _pipe */.yz),
  _positive: () => (api/* _positive */.NC),
  _promise: () => (api/* _promise */.Z$),
  _property: () => (api/* _property */.Jf),
  _readonly: () => (api/* _readonly */.CM),
  _record: () => (api/* _record */.Bb),
  _refine: () => (api/* _refine */.fU),
  _regex: () => (api/* _regex */.Fk),
  _safeParse: () => (parse/* _safeParse */.Od),
  _safeParseAsync: () => (parse/* _safeParseAsync */.wG),
  _set: () => (api/* _set */.QC),
  _size: () => (api/* _size */.d$),
  _startsWith: () => (api/* _startsWith */.$S),
  _string: () => (api/* _string */.Rl),
  _stringFormat: () => (api/* _stringFormat */.Af),
  _stringbool: () => (api/* _stringbool */.fI),
  _success: () => (api/* _success */.P7),
  _symbol: () => (api/* _symbol */.W7),
  _templateLiteral: () => (api/* _templateLiteral */.Bt),
  _toLowerCase: () => (api/* _toLowerCase */.Il),
  _toUpperCase: () => (api/* _toUpperCase */.xY),
  _transform: () => (api/* _transform */.MQ),
  _trim: () => (api/* _trim */.WN),
  _tuple: () => (api/* _tuple */.gt),
  _uint32: () => (api/* _uint32 */.P),
  _uint64: () => (api/* _uint64 */.ii),
  _ulid: () => (api/* _ulid */.Ct),
  _undefined: () => (api/* _undefined */.E4),
  _union: () => (api/* _union */.h8),
  _unknown: () => (api/* _unknown */.em),
  _uppercase: () => (api/* _uppercase */.qF),
  _url: () => (api/* _url */.Fn),
  _uuid: () => (api/* _uuid */.Be),
  _uuidv4: () => (api/* _uuidv4 */.nA),
  _uuidv6: () => (api/* _uuidv6 */.pY),
  _uuidv7: () => (api/* _uuidv7 */.wA),
  _void: () => (api/* _void */.OC),
  _xid: () => (api/* _xid */.Pw),
  clone: () => (schemas/* clone */.o8),
  config: () => (core/* config */.$W),
  flattenError: () => (errors/* flattenError */.JM),
  formatError: () => (errors/* formatError */.Wk),
  "function": () => (_function),
  globalConfig: () => (core/* globalConfig */.cr),
  globalRegistry: () => (registries/* globalRegistry */.fd),
  isValidBase64: () => (schemas/* isValidBase64 */.UY),
  isValidBase64URL: () => (schemas/* isValidBase64URL */.tV),
  isValidJWT: () => (schemas/* isValidJWT */.c2),
  locales: () => (locales_namespaceObject),
  parse: () => (parse/* parse */.qg),
  parseAsync: () => (parse/* parseAsync */.EJ),
  prettifyError: () => (errors/* prettifyError */.S1),
  regexes: () => (regexes),
  registry: () => (registries/* registry */.u5),
  safeParse: () => (parse/* safeParse */.xL),
  safeParseAsync: () => (parse/* safeParseAsync */.bp),
  toDotPath: () => (errors/* toDotPath */.sR),
  toJSONSchema: () => (to_json_schema/* toJSONSchema */.b),
  treeifyError: () => (errors/* treeifyError */.ZC),
  util: () => (util),
  version: () => (versions/* version */.r)
});

// NAMESPACE OBJECT: ./node_modules/zod/v4/classic/coerce.js
var coerce_namespaceObject = {};
__webpack_require__.r(coerce_namespaceObject);
__webpack_require__.d(coerce_namespaceObject, {
  bigint: () => (bigint),
  boolean: () => (coerce_boolean),
  date: () => (date),
  number: () => (number),
  string: () => (string)
});

// NAMESPACE OBJECT: ./node_modules/zod/v4/classic/external.js
var external_namespaceObject = {};
__webpack_require__.r(external_namespaceObject);
__webpack_require__.d(external_namespaceObject, {
  $brand: () => (core/* $brand */._e),
  $input: () => (registries/* $input */.nP),
  $output: () => (registries/* $output */.UY),
  NEVER: () => (core/* NEVER */.tm),
  TimePrecision: () => (api/* TimePrecision */.So),
  ZodAny: () => (classic_schemas/* ZodAny */.Ml),
  ZodArray: () => (classic_schemas/* ZodArray */.n),
  ZodBase64: () => (classic_schemas/* ZodBase64 */.nL),
  ZodBase64URL: () => (classic_schemas/* ZodBase64URL */._$),
  ZodBigInt: () => (classic_schemas/* ZodBigInt */.Lr),
  ZodBigIntFormat: () => (classic_schemas/* ZodBigIntFormat */.A8),
  ZodBoolean: () => (classic_schemas/* ZodBoolean */.WF),
  ZodCIDRv4: () => (classic_schemas/* ZodCIDRv4 */.W5),
  ZodCIDRv6: () => (classic_schemas/* ZodCIDRv6 */.Yl),
  ZodCUID: () => (classic_schemas/* ZodCUID */.Jj),
  ZodCUID2: () => (classic_schemas/* ZodCUID2 */.tr),
  ZodCatch: () => (classic_schemas/* ZodCatch */.hw),
  ZodCustom: () => (classic_schemas/* ZodCustom */.JE),
  ZodCustomStringFormat: () => (classic_schemas/* ZodCustomStringFormat */.LE),
  ZodDate: () => (classic_schemas/* ZodDate */.aP),
  ZodDefault: () => (classic_schemas/* ZodDefault */.Xi),
  ZodDiscriminatedUnion: () => (classic_schemas/* ZodDiscriminatedUnion */.jv),
  ZodE164: () => (classic_schemas/* ZodE164 */.m7),
  ZodEmail: () => (classic_schemas/* ZodEmail */.cM),
  ZodEmoji: () => (classic_schemas/* ZodEmoji */.yC),
  ZodEnum: () => (classic_schemas/* ZodEnum */.Vb),
  ZodError: () => (classic_errors/* ZodError */.G),
  ZodFile: () => (classic_schemas/* ZodFile */.im),
  ZodGUID: () => (classic_schemas/* ZodGUID */.n4),
  ZodIPv4: () => (classic_schemas/* ZodIPv4 */.Bo),
  ZodIPv6: () => (classic_schemas/* ZodIPv6 */.Gp),
  ZodISODate: () => (iso.ZodISODate),
  ZodISODateTime: () => (iso.ZodISODateTime),
  ZodISODuration: () => (iso.ZodISODuration),
  ZodISOTime: () => (iso.ZodISOTime),
  ZodIntersection: () => (classic_schemas/* ZodIntersection */.Jv),
  ZodIssueCode: () => (ZodIssueCode),
  ZodJWT: () => (classic_schemas/* ZodJWT */.fi),
  ZodKSUID: () => (classic_schemas/* ZodKSUID */.Kf),
  ZodLazy: () => (classic_schemas/* ZodLazy */.Ih),
  ZodLiteral: () => (classic_schemas/* ZodLiteral */.DN),
  ZodMap: () => (classic_schemas/* ZodMap */.Ut),
  ZodNaN: () => (classic_schemas/* ZodNaN */.Tq),
  ZodNanoID: () => (classic_schemas/* ZodNanoID */.n$),
  ZodNever: () => (classic_schemas/* ZodNever */.iS),
  ZodNonOptional: () => (classic_schemas/* ZodNonOptional */.vZ),
  ZodNull: () => (classic_schemas/* ZodNull */.PQ),
  ZodNullable: () => (classic_schemas/* ZodNullable */.l1),
  ZodNumber: () => (classic_schemas/* ZodNumber */.rS),
  ZodNumberFormat: () => (classic_schemas/* ZodNumberFormat */.Kq),
  ZodObject: () => (classic_schemas/* ZodObject */.bv),
  ZodOptional: () => (classic_schemas/* ZodOptional */.Ii),
  ZodPipe: () => (classic_schemas/* ZodPipe */.ut),
  ZodPrefault: () => (classic_schemas/* ZodPrefault */.xg),
  ZodPromise: () => (classic_schemas/* ZodPromise */.$i),
  ZodReadonly: () => (classic_schemas/* ZodReadonly */.EV),
  ZodRealError: () => (classic_errors/* ZodRealError */.g),
  ZodRecord: () => (classic_schemas/* ZodRecord */.b8),
  ZodSet: () => (classic_schemas/* ZodSet */.Kz),
  ZodString: () => (classic_schemas/* ZodString */.ND),
  ZodStringFormat: () => (classic_schemas/* ZodStringFormat */.EB),
  ZodSuccess: () => (classic_schemas/* ZodSuccess */.Bu),
  ZodSymbol: () => (classic_schemas/* ZodSymbol */.K5),
  ZodTemplateLiteral: () => (classic_schemas/* ZodTemplateLiteral */.dd),
  ZodTransform: () => (classic_schemas/* ZodTransform */.CL),
  ZodTuple: () => (classic_schemas/* ZodTuple */.y0),
  ZodType: () => (classic_schemas/* ZodType */.aR),
  ZodULID: () => (classic_schemas/* ZodULID */.qX),
  ZodURL: () => (classic_schemas/* ZodURL */.zY),
  ZodUUID: () => (classic_schemas/* ZodUUID */.vX),
  ZodUndefined: () => (classic_schemas/* ZodUndefined */._Z),
  ZodUnion: () => (classic_schemas/* ZodUnion */.fZ),
  ZodUnknown: () => (classic_schemas/* ZodUnknown */._),
  ZodVoid: () => (classic_schemas/* ZodVoid */.a0),
  ZodXID: () => (classic_schemas/* ZodXID */.Lq),
  _ZodString: () => (classic_schemas/* _ZodString */.UC),
  _default: () => (classic_schemas/* _default */.Rv),
  any: () => (classic_schemas/* any */.bz),
  array: () => (classic_schemas/* array */.YO),
  base64: () => (classic_schemas/* base64 */.K3),
  base64url: () => (classic_schemas/* base64url */.r0),
  bigint: () => (classic_schemas/* bigint */.o),
  boolean: () => (classic_schemas/* boolean */.zM),
  "catch": () => (classic_schemas/* catch */.Mf),
  check: () => (classic_schemas/* check */.z6),
  cidrv4: () => (classic_schemas/* cidrv4 */.zr),
  cidrv6: () => (classic_schemas/* cidrv6 */.l7),
  clone: () => (util.clone),
  coerce: () => (coerce_namespaceObject),
  config: () => (core/* config */.$W),
  core: () => (core_namespaceObject),
  cuid: () => (classic_schemas/* cuid */.gF),
  cuid2: () => (classic_schemas/* cuid2 */.Gl),
  custom: () => (classic_schemas/* custom */.Ie),
  date: () => (classic_schemas/* date */.p6),
  discriminatedUnion: () => (classic_schemas/* discriminatedUnion */.gM),
  e164: () => (classic_schemas/* e164 */.hQ),
  email: () => (classic_schemas/* email */.Rp),
  emoji: () => (classic_schemas/* emoji */.Zg),
  endsWith: () => (api/* _endsWith */.ER),
  "enum": () => (classic_schemas/* enum */.k5),
  file: () => (classic_schemas/* file */.NJ),
  flattenError: () => (errors/* flattenError */.JM),
  float32: () => (classic_schemas/* float32 */.In),
  float64: () => (classic_schemas/* float64 */.BN),
  formatError: () => (errors/* formatError */.Wk),
  "function": () => (_function),
  getErrorMap: () => (getErrorMap),
  globalRegistry: () => (registries/* globalRegistry */.fd),
  gt: () => (api/* _gt */.Tx),
  gte: () => (api/* _gte */.qm),
  guid: () => (classic_schemas/* guid */.Os),
  includes: () => (api/* _includes */.dR),
  "instanceof": () => (classic_schemas/* instanceof */.Nl),
  int: () => (classic_schemas/* int */.Wh),
  int32: () => (classic_schemas/* int32 */.HA),
  int64: () => (classic_schemas/* int64 */.Gk),
  intersection: () => (classic_schemas/* intersection */.E$),
  ipv4: () => (classic_schemas/* ipv4 */.uX),
  ipv6: () => (classic_schemas/* ipv6 */.ug),
  iso: () => (iso),
  json: () => (classic_schemas/* json */.Pq),
  jwt: () => (classic_schemas/* jwt */.a$),
  keyof: () => (classic_schemas/* keyof */.ZE),
  ksuid: () => (classic_schemas/* ksuid */.fO),
  lazy: () => (classic_schemas/* lazy */.RZ),
  length: () => (api/* _length */.YA),
  literal: () => (classic_schemas/* literal */.eu),
  locales: () => (locales_namespaceObject),
  looseObject: () => (classic_schemas/* looseObject */._H),
  lowercase: () => (api/* _lowercase */.hH),
  lt: () => (api/* _lt */.Au),
  lte: () => (api/* _lte */.Zm),
  map: () => (classic_schemas/* map */.Tj),
  maxLength: () => (api/* _maxLength */.Eb),
  maxSize: () => (api/* _maxSize */.vL),
  mime: () => (api/* _mime */.GZ),
  minLength: () => (api/* _minLength */.m9),
  minSize: () => (api/* _minSize */.Nd),
  multipleOf: () => (api/* _multipleOf */.Hi),
  nan: () => (classic_schemas/* nan */.oi),
  nanoid: () => (classic_schemas/* nanoid */.Ak),
  nativeEnum: () => (classic_schemas/* nativeEnum */.fc),
  negative: () => (api/* _negative */.bR),
  never: () => (classic_schemas/* never */.Zm),
  nonnegative: () => (api/* _nonnegative */.UI),
  nonoptional: () => (classic_schemas/* nonoptional */.eY),
  nonpositive: () => (api/* _nonpositive */.ej),
  normalize: () => (api/* _normalize */.lo),
  "null": () => (classic_schemas/* null */.ch),
  nullable: () => (classic_schemas/* nullable */.me),
  nullish: () => (classic_schemas/* nullish */.cl),
  number: () => (classic_schemas/* number */.ai),
  object: () => (classic_schemas/* object */.Ik),
  optional: () => (classic_schemas/* optional */.lq),
  overwrite: () => (api/* _overwrite */.bS),
  parse: () => (classic_parse/* parse */.qg),
  parseAsync: () => (classic_parse/* parseAsync */.EJ),
  partialRecord: () => (classic_schemas/* partialRecord */.jg),
  pipe: () => (classic_schemas/* pipe */.Fs),
  positive: () => (api/* _positive */.NC),
  prefault: () => (classic_schemas/* prefault */.Sd),
  preprocess: () => (classic_schemas/* preprocess */.vk),
  prettifyError: () => (errors/* prettifyError */.S1),
  promise: () => (classic_schemas/* promise */.iv),
  property: () => (api/* _property */.Jf),
  readonly: () => (classic_schemas/* readonly */.tB),
  record: () => (classic_schemas/* record */.g1),
  refine: () => (classic_schemas/* refine */.YP),
  regex: () => (api/* _regex */.Fk),
  regexes: () => (regexes),
  registry: () => (registries/* registry */.u5),
  safeParse: () => (classic_parse/* safeParse */.xL),
  safeParseAsync: () => (classic_parse/* safeParseAsync */.bp),
  set: () => (classic_schemas/* set */.hZ),
  setErrorMap: () => (setErrorMap),
  size: () => (api/* _size */.d$),
  startsWith: () => (api/* _startsWith */.$S),
  strictObject: () => (classic_schemas/* strictObject */.re),
  string: () => (classic_schemas/* string */.Yj),
  stringFormat: () => (classic_schemas/* stringFormat */.Np),
  stringbool: () => (classic_schemas/* stringbool */.uE),
  success: () => (classic_schemas/* success */.kX),
  superRefine: () => (classic_schemas/* superRefine */.zn),
  symbol: () => (classic_schemas/* symbol */.HR),
  templateLiteral: () => (classic_schemas/* templateLiteral */.Uy),
  toJSONSchema: () => (to_json_schema/* toJSONSchema */.b),
  toLowerCase: () => (api/* _toLowerCase */.Il),
  toUpperCase: () => (api/* _toUpperCase */.xY),
  transform: () => (classic_schemas/* transform */.pd),
  treeifyError: () => (errors/* treeifyError */.ZC),
  trim: () => (api/* _trim */.WN),
  tuple: () => (classic_schemas/* tuple */.PV),
  uint32: () => (classic_schemas/* uint32 */.S8),
  uint64: () => (classic_schemas/* uint64 */.VV),
  ulid: () => (classic_schemas/* ulid */.Z0),
  undefined: () => (classic_schemas/* undefined */.Vx),
  union: () => (classic_schemas/* union */.KC),
  unknown: () => (classic_schemas/* unknown */.L5),
  uppercase: () => (api/* _uppercase */.qF),
  url: () => (classic_schemas/* url */.OZ),
  uuid: () => (classic_schemas/* uuid */.uR),
  uuidv4: () => (classic_schemas/* uuidv4 */.gZ),
  uuidv6: () => (classic_schemas/* uuidv6 */.gE),
  uuidv7: () => (classic_schemas/* uuidv7 */.nH),
  "void": () => (classic_schemas/* void */.rI),
  xid: () => (classic_schemas/* xid */.kM)
});

// EXTERNAL MODULE: ./node_modules/zod/v4/core/core.js
var core = __webpack_require__(8532);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/parse.js
var parse = __webpack_require__(4196);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/errors.js
var errors = __webpack_require__(7428);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/schemas.js
var schemas = __webpack_require__(5591);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/checks.js
var checks = __webpack_require__(4890);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/versions.js
var versions = __webpack_require__(6406);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/util.js
var util = __webpack_require__(4723);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/regexes.js
var regexes = __webpack_require__(3908);
;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ar.js

const error = () => {
    const Sizable = {
        string: { unit: "حرف", verb: "أن يحوي" },
        file: { unit: "بايت", verb: "أن يحوي" },
        array: { unit: "عنصر", verb: "أن يحوي" },
        set: { unit: "عنصر", verb: "أن يحوي" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "مدخل",
        email: "بريد إلكتروني",
        url: "رابط",
        emoji: "إيموجي",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "تاريخ ووقت بمعيار ISO",
        date: "تاريخ بمعيار ISO",
        time: "وقت بمعيار ISO",
        duration: "مدة بمعيار ISO",
        ipv4: "عنوان IPv4",
        ipv6: "عنوان IPv6",
        cidrv4: "مدى عناوين بصيغة IPv4",
        cidrv6: "مدى عناوين بصيغة IPv6",
        base64: "نَص بترميز base64-encoded",
        base64url: "نَص بترميز base64url-encoded",
        json_string: "نَص على هيئة JSON",
        e164: "رقم هاتف بمعيار E.164",
        jwt: "JWT",
        template_literal: "مدخل",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `مدخلات غير مقبولة: يفترض إدخال ${issue.expected}، ولكن تم إدخال ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `مدخلات غير مقبولة: يفترض إدخال ${util.stringifyPrimitive(issue.values[0])}`;
                return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return ` أكبر من اللازم: يفترض أن تكون ${issue.origin ?? "القيمة"} ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "عنصر"}`;
                return `أكبر من اللازم: يفترض أن تكون ${issue.origin ?? "القيمة"} ${adj} ${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `أصغر من اللازم: يفترض لـ ${issue.origin} أن يكون ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `أصغر من اللازم: يفترض لـ ${issue.origin} أن يكون ${adj} ${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `نَص غير مقبول: يجب أن يبدأ بـ "${issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `نَص غير مقبول: يجب أن ينتهي بـ "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `نَص غير مقبول: يجب أن يتضمَّن "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `نَص غير مقبول: يجب أن يطابق النمط ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} غير مقبول`;
            }
            case "not_multiple_of":
                return `رقم غير مقبول: يجب أن يكون من مضاعفات ${issue.divisor}`;
            case "unrecognized_keys":
                return `معرف${issue.keys.length > 1 ? "ات" : ""} غريب${issue.keys.length > 1 ? "ة" : ""}: ${util.joinValues(issue.keys, "، ")}`;
            case "invalid_key":
                return `معرف غير مقبول في ${issue.origin}`;
            case "invalid_union":
                return "مدخل غير مقبول";
            case "invalid_element":
                return `مدخل غير مقبول في ${issue.origin}`;
            default:
                return "مدخل غير مقبول";
        }
    };
};
/* harmony default export */ function ar() {
    return {
        localeError: error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/az.js

const az_error = () => {
    const Sizable = {
        string: { unit: "simvol", verb: "olmalıdır" },
        file: { unit: "bayt", verb: "olmalıdır" },
        array: { unit: "element", verb: "olmalıdır" },
        set: { unit: "element", verb: "olmalıdır" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "input",
        email: "email address",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datetime",
        date: "ISO date",
        time: "ISO time",
        duration: "ISO duration",
        ipv4: "IPv4 address",
        ipv6: "IPv6 address",
        cidrv4: "IPv4 range",
        cidrv6: "IPv6 range",
        base64: "base64-encoded string",
        base64url: "base64url-encoded string",
        json_string: "JSON string",
        e164: "E.164 number",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Yanlış dəyər: gözlənilən ${issue.expected}, daxil olan ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Yanlış dəyər: gözlənilən ${util.stringifyPrimitive(issue.values[0])}`;
                return `Yanlış seçim: aşağıdakılardan biri olmalıdır: ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Çox böyük: gözlənilən ${issue.origin ?? "dəyər"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "element"}`;
                return `Çox böyük: gözlənilən ${issue.origin ?? "dəyər"} ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Çox kiçik: gözlənilən ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                return `Çox kiçik: gözlənilən ${issue.origin} ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Yanlış mətn: "${_issue.prefix}" ilə başlamalıdır`;
                if (_issue.format === "ends_with")
                    return `Yanlış mətn: "${_issue.suffix}" ilə bitməlidir`;
                if (_issue.format === "includes")
                    return `Yanlış mətn: "${_issue.includes}" daxil olmalıdır`;
                if (_issue.format === "regex")
                    return `Yanlış mətn: ${_issue.pattern} şablonuna uyğun olmalıdır`;
                return `Yanlış ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Yanlış ədəd: ${issue.divisor} ilə bölünə bilən olmalıdır`;
            case "unrecognized_keys":
                return `Tanınmayan açar${issue.keys.length > 1 ? "lar" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `${issue.origin} daxilində yanlış açar`;
            case "invalid_union":
                return "Yanlış dəyər";
            case "invalid_element":
                return `${issue.origin} daxilində yanlış dəyər`;
            default:
                return `Yanlış dəyər`;
        }
    };
};
/* harmony default export */ function az() {
    return {
        localeError: az_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/be.js

function getBelarusianPlural(count, one, few, many) {
    const absCount = Math.abs(count);
    const lastDigit = absCount % 10;
    const lastTwoDigits = absCount % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return many;
    }
    if (lastDigit === 1) {
        return one;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
        return few;
    }
    return many;
}
const be_error = () => {
    const Sizable = {
        string: {
            unit: {
                one: "сімвал",
                few: "сімвалы",
                many: "сімвалаў",
            },
            verb: "мець",
        },
        array: {
            unit: {
                one: "элемент",
                few: "элементы",
                many: "элементаў",
            },
            verb: "мець",
        },
        set: {
            unit: {
                one: "элемент",
                few: "элементы",
                many: "элементаў",
            },
            verb: "мець",
        },
        file: {
            unit: {
                one: "байт",
                few: "байты",
                many: "байтаў",
            },
            verb: "мець",
        },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "лік";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "масіў";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "увод",
        email: "email адрас",
        url: "URL",
        emoji: "эмодзі",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO дата і час",
        date: "ISO дата",
        time: "ISO час",
        duration: "ISO працягласць",
        ipv4: "IPv4 адрас",
        ipv6: "IPv6 адрас",
        cidrv4: "IPv4 дыяпазон",
        cidrv6: "IPv6 дыяпазон",
        base64: "радок у фармаце base64",
        base64url: "радок у фармаце base64url",
        json_string: "JSON радок",
        e164: "нумар E.164",
        jwt: "JWT",
        template_literal: "увод",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Няправільны ўвод: чакаўся ${issue.expected}, атрымана ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Няправільны ўвод: чакалася ${util.stringifyPrimitive(issue.values[0])}`;
                return `Няправільны варыянт: чакаўся адзін з ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    const maxValue = Number(issue.maximum);
                    const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
                    return `Занадта вялікі: чакалася, што ${issue.origin ?? "значэнне"} павінна ${sizing.verb} ${adj}${issue.maximum.toString()} ${unit}`;
                }
                return `Занадта вялікі: чакалася, што ${issue.origin ?? "значэнне"} павінна быць ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    const minValue = Number(issue.minimum);
                    const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
                    return `Занадта малы: чакалася, што ${issue.origin} павінна ${sizing.verb} ${adj}${issue.minimum.toString()} ${unit}`;
                }
                return `Занадта малы: чакалася, што ${issue.origin} павінна быць ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Няправільны радок: павінен пачынацца з "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Няправільны радок: павінен заканчвацца на "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Няправільны радок: павінен змяшчаць "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Няправільны радок: павінен адпавядаць шаблону ${_issue.pattern}`;
                return `Няправільны ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Няправільны лік: павінен быць кратным ${issue.divisor}`;
            case "unrecognized_keys":
                return `Нераспазнаны ${issue.keys.length > 1 ? "ключы" : "ключ"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Няправільны ключ у ${issue.origin}`;
            case "invalid_union":
                return "Няправільны ўвод";
            case "invalid_element":
                return `Няправільнае значэнне ў ${issue.origin}`;
            default:
                return `Няправільны ўвод`;
        }
    };
};
/* harmony default export */ function be() {
    return {
        localeError: be_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ca.js

const ca_error = () => {
    const Sizable = {
        string: { unit: "caràcters", verb: "contenir" },
        file: { unit: "bytes", verb: "contenir" },
        array: { unit: "elements", verb: "contenir" },
        set: { unit: "elements", verb: "contenir" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "entrada",
        email: "adreça electrònica",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data i hora ISO",
        date: "data ISO",
        time: "hora ISO",
        duration: "durada ISO",
        ipv4: "adreça IPv4",
        ipv6: "adreça IPv6",
        cidrv4: "rang IPv4",
        cidrv6: "rang IPv6",
        base64: "cadena codificada en base64",
        base64url: "cadena codificada en base64url",
        json_string: "cadena JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Tipus invàlid: s'esperava ${issue.expected}, s'ha rebut ${parsedType(issue.input)}`;
            // return `Tipus invàlid: s'esperava ${issue.expected}, s'ha rebut ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Valor invàlid: s'esperava ${util.stringifyPrimitive(issue.values[0])}`;
                return `Opció invàlida: s'esperava una de ${util.joinValues(issue.values, " o ")}`;
            case "too_big": {
                const adj = issue.inclusive ? "com a màxim" : "menys de";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Massa gran: s'esperava que ${issue.origin ?? "el valor"} contingués ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
                return `Massa gran: s'esperava que ${issue.origin ?? "el valor"} fos ${adj} ${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? "com a mínim" : "més de";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Massa petit: s'esperava que ${issue.origin} contingués ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Massa petit: s'esperava que ${issue.origin} fos ${adj} ${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Format invàlid: ha de començar amb "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Format invàlid: ha d'acabar amb "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Format invàlid: ha d'incloure "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Format invàlid: ha de coincidir amb el patró ${_issue.pattern}`;
                return `Format invàlid per a ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Número invàlid: ha de ser múltiple de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Clau${issue.keys.length > 1 ? "s" : ""} no reconeguda${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Clau invàlida a ${issue.origin}`;
            case "invalid_union":
                return "Entrada invàlida"; // Could also be "Tipus d'unió invàlid" but "Entrada invàlida" is more general
            case "invalid_element":
                return `Element invàlid a ${issue.origin}`;
            default:
                return `Entrada invàlida`;
        }
    };
};
/* harmony default export */ function ca() {
    return {
        localeError: ca_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/cs.js

const cs_error = () => {
    const Sizable = {
        string: { unit: "znaků", verb: "mít" },
        file: { unit: "bajtů", verb: "mít" },
        array: { unit: "prvků", verb: "mít" },
        set: { unit: "prvků", verb: "mít" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "číslo";
            }
            case "string": {
                return "řetězec";
            }
            case "boolean": {
                return "boolean";
            }
            case "bigint": {
                return "bigint";
            }
            case "function": {
                return "funkce";
            }
            case "symbol": {
                return "symbol";
            }
            case "undefined": {
                return "undefined";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "pole";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "regulární výraz",
        email: "e-mailová adresa",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "datum a čas ve formátu ISO",
        date: "datum ve formátu ISO",
        time: "čas ve formátu ISO",
        duration: "doba trvání ISO",
        ipv4: "IPv4 adresa",
        ipv6: "IPv6 adresa",
        cidrv4: "rozsah IPv4",
        cidrv6: "rozsah IPv6",
        base64: "řetězec zakódovaný ve formátu base64",
        base64url: "řetězec zakódovaný ve formátu base64url",
        json_string: "řetězec ve formátu JSON",
        e164: "číslo E.164",
        jwt: "JWT",
        template_literal: "vstup",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Neplatný vstup: očekáváno ${issue.expected}, obdrženo ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Neplatný vstup: očekáváno ${util.stringifyPrimitive(issue.values[0])}`;
                return `Neplatná možnost: očekávána jedna z hodnot ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Hodnota je příliš velká: ${issue.origin ?? "hodnota"} musí mít ${adj}${issue.maximum.toString()} ${sizing.unit ?? "prvků"}`;
                }
                return `Hodnota je příliš velká: ${issue.origin ?? "hodnota"} musí být ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Hodnota je příliš malá: ${issue.origin ?? "hodnota"} musí mít ${adj}${issue.minimum.toString()} ${sizing.unit ?? "prvků"}`;
                }
                return `Hodnota je příliš malá: ${issue.origin ?? "hodnota"} musí být ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Neplatný řetězec: musí začínat na "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Neplatný řetězec: musí končit na "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Neplatný řetězec: musí obsahovat "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Neplatný řetězec: musí odpovídat vzoru ${_issue.pattern}`;
                return `Neplatný formát ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Neplatné číslo: musí být násobkem ${issue.divisor}`;
            case "unrecognized_keys":
                return `Neznámé klíče: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Neplatný klíč v ${issue.origin}`;
            case "invalid_union":
                return "Neplatný vstup";
            case "invalid_element":
                return `Neplatná hodnota v ${issue.origin}`;
            default:
                return `Neplatný vstup`;
        }
    };
};
/* harmony default export */ function cs() {
    return {
        localeError: cs_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/de.js

const de_error = () => {
    const Sizable = {
        string: { unit: "Zeichen", verb: "zu haben" },
        file: { unit: "Bytes", verb: "zu haben" },
        array: { unit: "Elemente", verb: "zu haben" },
        set: { unit: "Elemente", verb: "zu haben" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "Zahl";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "Array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "Eingabe",
        email: "E-Mail-Adresse",
        url: "URL",
        emoji: "Emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-Datum und -Uhrzeit",
        date: "ISO-Datum",
        time: "ISO-Uhrzeit",
        duration: "ISO-Dauer",
        ipv4: "IPv4-Adresse",
        ipv6: "IPv6-Adresse",
        cidrv4: "IPv4-Bereich",
        cidrv6: "IPv6-Bereich",
        base64: "Base64-codierter String",
        base64url: "Base64-URL-codierter String",
        json_string: "JSON-String",
        e164: "E.164-Nummer",
        jwt: "JWT",
        template_literal: "Eingabe",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Ungültige Eingabe: erwartet ${issue.expected}, erhalten ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Ungültige Eingabe: erwartet ${util.stringifyPrimitive(issue.values[0])}`;
                return `Ungültige Option: erwartet eine von ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Zu groß: erwartet, dass ${issue.origin ?? "Wert"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
                return `Zu groß: erwartet, dass ${issue.origin ?? "Wert"} ${adj}${issue.maximum.toString()} ist`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Zu klein: erwartet, dass ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} hat`;
                }
                return `Zu klein: erwartet, dass ${issue.origin} ${adj}${issue.minimum.toString()} ist`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Ungültiger String: muss mit "${_issue.prefix}" beginnen`;
                if (_issue.format === "ends_with")
                    return `Ungültiger String: muss mit "${_issue.suffix}" enden`;
                if (_issue.format === "includes")
                    return `Ungültiger String: muss "${_issue.includes}" enthalten`;
                if (_issue.format === "regex")
                    return `Ungültiger String: muss dem Muster ${_issue.pattern} entsprechen`;
                return `Ungültig: ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Ungültige Zahl: muss ein Vielfaches von ${issue.divisor} sein`;
            case "unrecognized_keys":
                return `${issue.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Ungültiger Schlüssel in ${issue.origin}`;
            case "invalid_union":
                return "Ungültige Eingabe";
            case "invalid_element":
                return `Ungültiger Wert in ${issue.origin}`;
            default:
                return `Ungültige Eingabe`;
        }
    };
};
/* harmony default export */ function de() {
    return {
        localeError: de_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/en.js

const parsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "number": {
            return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
            if (Array.isArray(data)) {
                return "array";
            }
            if (data === null) {
                return "null";
            }
            if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                return data.constructor.name;
            }
        }
    }
    return t;
};
const en_error = () => {
    const Sizable = {
        string: { unit: "characters", verb: "to have" },
        file: { unit: "bytes", verb: "to have" },
        array: { unit: "items", verb: "to have" },
        set: { unit: "items", verb: "to have" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const Nouns = {
        regex: "input",
        email: "email address",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datetime",
        date: "ISO date",
        time: "ISO time",
        duration: "ISO duration",
        ipv4: "IPv4 address",
        ipv6: "IPv6 address",
        cidrv4: "IPv4 range",
        cidrv6: "IPv6 range",
        base64: "base64-encoded string",
        base64url: "base64url-encoded string",
        json_string: "JSON string",
        e164: "E.164 number",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Invalid input: expected ${issue.expected}, received ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Invalid input: expected ${util.stringifyPrimitive(issue.values[0])}`;
                return `Invalid option: expected one of ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
                return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Invalid string: must start with "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Invalid string: must end with "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Invalid string: must include "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Invalid string: must match pattern ${_issue.pattern}`;
                return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Invalid number: must be a multiple of ${issue.divisor}`;
            case "unrecognized_keys":
                return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Invalid key in ${issue.origin}`;
            case "invalid_union":
                return "Invalid input";
            case "invalid_element":
                return `Invalid value in ${issue.origin}`;
            default:
                return `Invalid input`;
        }
    };
};
/* harmony default export */ function en() {
    return {
        localeError: en_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/eo.js

const eo_parsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "number": {
            return Number.isNaN(data) ? "NaN" : "nombro";
        }
        case "object": {
            if (Array.isArray(data)) {
                return "tabelo";
            }
            if (data === null) {
                return "senvalora";
            }
            if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                return data.constructor.name;
            }
        }
    }
    return t;
};
const eo_error = () => {
    const Sizable = {
        string: { unit: "karaktrojn", verb: "havi" },
        file: { unit: "bajtojn", verb: "havi" },
        array: { unit: "elementojn", verb: "havi" },
        set: { unit: "elementojn", verb: "havi" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const Nouns = {
        regex: "enigo",
        email: "retadreso",
        url: "URL",
        emoji: "emoĝio",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-datotempo",
        date: "ISO-dato",
        time: "ISO-tempo",
        duration: "ISO-daŭro",
        ipv4: "IPv4-adreso",
        ipv6: "IPv6-adreso",
        cidrv4: "IPv4-rango",
        cidrv6: "IPv6-rango",
        base64: "64-ume kodita karaktraro",
        base64url: "URL-64-ume kodita karaktraro",
        json_string: "JSON-karaktraro",
        e164: "E.164-nombro",
        jwt: "JWT",
        template_literal: "enigo",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Nevalida enigo: atendiĝis ${issue.expected}, riceviĝis ${eo_parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Nevalida enigo: atendiĝis ${util.stringifyPrimitive(issue.values[0])}`;
                return `Nevalida opcio: atendiĝis unu el ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Tro granda: atendiĝis ke ${issue.origin ?? "valoro"} havu ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
                return `Tro granda: atendiĝis ke ${issue.origin ?? "valoro"} havu ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Tro malgranda: atendiĝis ke ${issue.origin} havu ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Tro malgranda: atendiĝis ke ${issue.origin} estu ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Nevalida karaktraro: devas komenciĝi per "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Nevalida karaktraro: devas finiĝi per "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
                return `Nevalida ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Nevalida nombro: devas esti oblo de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Nekonata${issue.keys.length > 1 ? "j" : ""} ŝlosilo${issue.keys.length > 1 ? "j" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Nevalida ŝlosilo en ${issue.origin}`;
            case "invalid_union":
                return "Nevalida enigo";
            case "invalid_element":
                return `Nevalida valoro en ${issue.origin}`;
            default:
                return `Nevalida enigo`;
        }
    };
};
/* harmony default export */ function eo() {
    return {
        localeError: eo_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/es.js

const es_error = () => {
    const Sizable = {
        string: { unit: "caracteres", verb: "tener" },
        file: { unit: "bytes", verb: "tener" },
        array: { unit: "elementos", verb: "tener" },
        set: { unit: "elementos", verb: "tener" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "número";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "arreglo";
                }
                if (data === null) {
                    return "nulo";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "entrada",
        email: "dirección de correo electrónico",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "fecha y hora ISO",
        date: "fecha ISO",
        time: "hora ISO",
        duration: "duración ISO",
        ipv4: "dirección IPv4",
        ipv6: "dirección IPv6",
        cidrv4: "rango IPv4",
        cidrv6: "rango IPv6",
        base64: "cadena codificada en base64",
        base64url: "URL codificada en base64",
        json_string: "cadena JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Entrada inválida: se esperaba ${issue.expected}, recibido ${parsedType(issue.input)}`;
            // return `Entrada inválida: se esperaba ${issue.expected}, recibido ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Entrada inválida: se esperaba ${util.stringifyPrimitive(issue.values[0])}`;
                return `Opción inválida: se esperaba una de ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Demasiado grande: se esperaba que ${issue.origin ?? "valor"} tuviera ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementos"}`;
                return `Demasiado grande: se esperaba que ${issue.origin ?? "valor"} fuera ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Demasiado pequeño: se esperaba que ${issue.origin} tuviera ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Demasiado pequeño: se esperaba que ${issue.origin} fuera ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Cadena inválida: debe comenzar con "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Cadena inválida: debe terminar en "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Cadena inválida: debe incluir "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Cadena inválida: debe coincidir con el patrón ${_issue.pattern}`;
                return `Inválido ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Número inválido: debe ser múltiplo de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Llave${issue.keys.length > 1 ? "s" : ""} desconocida${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Llave inválida en ${issue.origin}`;
            case "invalid_union":
                return "Entrada inválida";
            case "invalid_element":
                return `Valor inválido en ${issue.origin}`;
            default:
                return `Entrada inválida`;
        }
    };
};
/* harmony default export */ function es() {
    return {
        localeError: es_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/fa.js

const fa_error = () => {
    const Sizable = {
        string: { unit: "کاراکتر", verb: "داشته باشد" },
        file: { unit: "بایت", verb: "داشته باشد" },
        array: { unit: "آیتم", verb: "داشته باشد" },
        set: { unit: "آیتم", verb: "داشته باشد" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "عدد";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "آرایه";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ورودی",
        email: "آدرس ایمیل",
        url: "URL",
        emoji: "ایموجی",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "تاریخ و زمان ایزو",
        date: "تاریخ ایزو",
        time: "زمان ایزو",
        duration: "مدت زمان ایزو",
        ipv4: "IPv4 آدرس",
        ipv6: "IPv6 آدرس",
        cidrv4: "IPv4 دامنه",
        cidrv6: "IPv6 دامنه",
        base64: "base64-encoded رشته",
        base64url: "base64url-encoded رشته",
        json_string: "JSON رشته",
        e164: "E.164 عدد",
        jwt: "JWT",
        template_literal: "ورودی",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `ورودی نامعتبر: می‌بایست ${issue.expected} می‌بود، ${parsedType(issue.input)} دریافت شد`;
            case "invalid_value":
                if (issue.values.length === 1) {
                    return `ورودی نامعتبر: می‌بایست ${util.stringifyPrimitive(issue.values[0])} می‌بود`;
                }
                return `گزینه نامعتبر: می‌بایست یکی از ${util.joinValues(issue.values, "|")} می‌بود`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `خیلی بزرگ: ${issue.origin ?? "مقدار"} باید ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عنصر"} باشد`;
                }
                return `خیلی بزرگ: ${issue.origin ?? "مقدار"} باید ${adj}${issue.maximum.toString()} باشد`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `خیلی کوچک: ${issue.origin} باید ${adj}${issue.minimum.toString()} ${sizing.unit} باشد`;
                }
                return `خیلی کوچک: ${issue.origin} باید ${adj}${issue.minimum.toString()} باشد`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `رشته نامعتبر: باید با "${_issue.prefix}" شروع شود`;
                }
                if (_issue.format === "ends_with") {
                    return `رشته نامعتبر: باید با "${_issue.suffix}" تمام شود`;
                }
                if (_issue.format === "includes") {
                    return `رشته نامعتبر: باید شامل "${_issue.includes}" باشد`;
                }
                if (_issue.format === "regex") {
                    return `رشته نامعتبر: باید با الگوی ${_issue.pattern} مطابقت داشته باشد`;
                }
                return `${Nouns[_issue.format] ?? issue.format} نامعتبر`;
            }
            case "not_multiple_of":
                return `عدد نامعتبر: باید مضرب ${issue.divisor} باشد`;
            case "unrecognized_keys":
                return `کلید${issue.keys.length > 1 ? "های" : ""} ناشناس: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `کلید ناشناس در ${issue.origin}`;
            case "invalid_union":
                return `ورودی نامعتبر`;
            case "invalid_element":
                return `مقدار نامعتبر در ${issue.origin}`;
            default:
                return `ورودی نامعتبر`;
        }
    };
};
/* harmony default export */ function fa() {
    return {
        localeError: fa_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/fi.js

const fi_error = () => {
    const Sizable = {
        string: { unit: "merkkiä", subject: "merkkijonon" },
        file: { unit: "tavua", subject: "tiedoston" },
        array: { unit: "alkiota", subject: "listan" },
        set: { unit: "alkiota", subject: "joukon" },
        number: { unit: "", subject: "luvun" },
        bigint: { unit: "", subject: "suuren kokonaisluvun" },
        int: { unit: "", subject: "kokonaisluvun" },
        date: { unit: "", subject: "päivämäärän" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "säännöllinen lauseke",
        email: "sähköpostiosoite",
        url: "URL-osoite",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-aikaleima",
        date: "ISO-päivämäärä",
        time: "ISO-aika",
        duration: "ISO-kesto",
        ipv4: "IPv4-osoite",
        ipv6: "IPv6-osoite",
        cidrv4: "IPv4-alue",
        cidrv6: "IPv6-alue",
        base64: "base64-koodattu merkkijono",
        base64url: "base64url-koodattu merkkijono",
        json_string: "JSON-merkkijono",
        e164: "E.164-luku",
        jwt: "JWT",
        template_literal: "templaattimerkkijono",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Virheellinen tyyppi: odotettiin ${issue.expected}, oli ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Virheellinen syöte: täytyy olla ${util.stringifyPrimitive(issue.values[0])}`;
                return `Virheellinen valinta: täytyy olla yksi seuraavista: ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Liian suuri: ${sizing.subject} täytyy olla ${adj}${issue.maximum.toString()} ${sizing.unit}`.trim();
                }
                return `Liian suuri: arvon täytyy olla ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Liian pieni: ${sizing.subject} täytyy olla ${adj}${issue.minimum.toString()} ${sizing.unit}`.trim();
                }
                return `Liian pieni: arvon täytyy olla ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Virheellinen syöte: täytyy alkaa "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Virheellinen syöte: täytyy loppua "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Virheellinen syöte: täytyy sisältää "${_issue.includes}"`;
                if (_issue.format === "regex") {
                    return `Virheellinen syöte: täytyy vastata säännöllistä lauseketta ${_issue.pattern}`;
                }
                return `Virheellinen ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Virheellinen luku: täytyy olla luvun ${issue.divisor} monikerta`;
            case "unrecognized_keys":
                return `${issue.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return "Virheellinen avain tietueessa";
            case "invalid_union":
                return "Virheellinen unioni";
            case "invalid_element":
                return "Virheellinen arvo joukossa";
            default:
                return `Virheellinen syöte`;
        }
    };
};
/* harmony default export */ function fi() {
    return {
        localeError: fi_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/fr.js

const fr_error = () => {
    const Sizable = {
        string: { unit: "caractères", verb: "avoir" },
        file: { unit: "octets", verb: "avoir" },
        array: { unit: "éléments", verb: "avoir" },
        set: { unit: "éléments", verb: "avoir" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "nombre";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "tableau";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "entrée",
        email: "adresse e-mail",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "date et heure ISO",
        date: "date ISO",
        time: "heure ISO",
        duration: "durée ISO",
        ipv4: "adresse IPv4",
        ipv6: "adresse IPv6",
        cidrv4: "plage IPv4",
        cidrv6: "plage IPv6",
        base64: "chaîne encodée en base64",
        base64url: "chaîne encodée en base64url",
        json_string: "chaîne JSON",
        e164: "numéro E.164",
        jwt: "JWT",
        template_literal: "entrée",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Entrée invalide : ${issue.expected} attendu, ${parsedType(issue.input)} reçu`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Entrée invalide : ${util.stringifyPrimitive(issue.values[0])} attendu`;
                return `Option invalide : une valeur parmi ${util.joinValues(issue.values, "|")} attendue`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Trop grand : ${issue.origin ?? "valeur"} doit ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "élément(s)"}`;
                return `Trop grand : ${issue.origin ?? "valeur"} doit être ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Trop petit : ${issue.origin} doit ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Trop petit : ${issue.origin} doit être ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Chaîne invalide : doit inclure "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Chaîne invalide : doit correspondre au modèle ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} invalide`;
            }
            case "not_multiple_of":
                return `Nombre invalide : doit être un multiple de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Clé${issue.keys.length > 1 ? "s" : ""} non reconnue${issue.keys.length > 1 ? "s" : ""} : ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Clé invalide dans ${issue.origin}`;
            case "invalid_union":
                return "Entrée invalide";
            case "invalid_element":
                return `Valeur invalide dans ${issue.origin}`;
            default:
                return `Entrée invalide`;
        }
    };
};
/* harmony default export */ function fr() {
    return {
        localeError: fr_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/fr-CA.js

const fr_CA_error = () => {
    const Sizable = {
        string: { unit: "caractères", verb: "avoir" },
        file: { unit: "octets", verb: "avoir" },
        array: { unit: "éléments", verb: "avoir" },
        set: { unit: "éléments", verb: "avoir" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "entrée",
        email: "adresse courriel",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "date-heure ISO",
        date: "date ISO",
        time: "heure ISO",
        duration: "durée ISO",
        ipv4: "adresse IPv4",
        ipv6: "adresse IPv6",
        cidrv4: "plage IPv4",
        cidrv6: "plage IPv6",
        base64: "chaîne encodée en base64",
        base64url: "chaîne encodée en base64url",
        json_string: "chaîne JSON",
        e164: "numéro E.164",
        jwt: "JWT",
        template_literal: "entrée",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Entrée invalide : attendu ${issue.expected}, reçu ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Entrée invalide : attendu ${util.stringifyPrimitive(issue.values[0])}`;
                return `Option invalide : attendu l'une des valeurs suivantes ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "≤" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Trop grand : attendu que ${issue.origin ?? "la valeur"} ait ${adj}${issue.maximum.toString()} ${sizing.unit}`;
                return `Trop grand : attendu que ${issue.origin ?? "la valeur"} soit ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? "≥" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Trop petit : attendu que ${issue.origin} ait ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Trop petit : attendu que ${issue.origin} soit ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Chaîne invalide : doit inclure "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Chaîne invalide : doit correspondre au motif ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} invalide`;
            }
            case "not_multiple_of":
                return `Nombre invalide : doit être un multiple de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Clé${issue.keys.length > 1 ? "s" : ""} non reconnue${issue.keys.length > 1 ? "s" : ""} : ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Clé invalide dans ${issue.origin}`;
            case "invalid_union":
                return "Entrée invalide";
            case "invalid_element":
                return `Valeur invalide dans ${issue.origin}`;
            default:
                return `Entrée invalide`;
        }
    };
};
/* harmony default export */ function fr_CA() {
    return {
        localeError: fr_CA_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/he.js

const he_error = () => {
    const Sizable = {
        string: { unit: "אותיות", verb: "לכלול" },
        file: { unit: "בייטים", verb: "לכלול" },
        array: { unit: "פריטים", verb: "לכלול" },
        set: { unit: "פריטים", verb: "לכלול" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "קלט",
        email: "כתובת אימייל",
        url: "כתובת רשת",
        emoji: "אימוג'י",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "תאריך וזמן ISO",
        date: "תאריך ISO",
        time: "זמן ISO",
        duration: "משך זמן ISO",
        ipv4: "כתובת IPv4",
        ipv6: "כתובת IPv6",
        cidrv4: "טווח IPv4",
        cidrv6: "טווח IPv6",
        base64: "מחרוזת בבסיס 64",
        base64url: "מחרוזת בבסיס 64 לכתובות רשת",
        json_string: "מחרוזת JSON",
        e164: "מספר E.164",
        jwt: "JWT",
        template_literal: "קלט",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `קלט לא תקין: צריך ${issue.expected}, התקבל ${parsedType(issue.input)}`;
            // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `קלט לא תקין: צריך ${util.stringifyPrimitive(issue.values[0])}`;
                return `קלט לא תקין: צריך אחת מהאפשרויות  ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `גדול מדי: ${issue.origin ?? "value"} צריך להיות ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
                return `גדול מדי: ${issue.origin ?? "value"} צריך להיות ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `קטן מדי: ${issue.origin} צריך להיות ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `קטן מדי: ${issue.origin} צריך להיות ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `מחרוזת לא תקינה: חייבת להתחיל ב"${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `מחרוזת לא תקינה: חייבת להסתיים ב "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `מחרוזת לא תקינה: חייבת לכלול "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `מחרוזת לא תקינה: חייבת להתאים לתבנית ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} לא תקין`;
            }
            case "not_multiple_of":
                return `מספר לא תקין: חייב להיות מכפלה של ${issue.divisor}`;
            case "unrecognized_keys":
                return `מפתח${issue.keys.length > 1 ? "ות" : ""} לא מזוה${issue.keys.length > 1 ? "ים" : "ה"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `מפתח לא תקין ב${issue.origin}`;
            case "invalid_union":
                return "קלט לא תקין";
            case "invalid_element":
                return `ערך לא תקין ב${issue.origin}`;
            default:
                return `קלט לא תקין`;
        }
    };
};
/* harmony default export */ function he() {
    return {
        localeError: he_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/hu.js

const hu_error = () => {
    const Sizable = {
        string: { unit: "karakter", verb: "legyen" },
        file: { unit: "byte", verb: "legyen" },
        array: { unit: "elem", verb: "legyen" },
        set: { unit: "elem", verb: "legyen" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "szám";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "tömb";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "bemenet",
        email: "email cím",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO időbélyeg",
        date: "ISO dátum",
        time: "ISO idő",
        duration: "ISO időintervallum",
        ipv4: "IPv4 cím",
        ipv6: "IPv6 cím",
        cidrv4: "IPv4 tartomány",
        cidrv6: "IPv6 tartomány",
        base64: "base64-kódolt string",
        base64url: "base64url-kódolt string",
        json_string: "JSON string",
        e164: "E.164 szám",
        jwt: "JWT",
        template_literal: "bemenet",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Érvénytelen bemenet: a várt érték ${issue.expected}, a kapott érték ${parsedType(issue.input)}`;
            // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Érvénytelen bemenet: a várt érték ${util.stringifyPrimitive(issue.values[0])}`;
                return `Érvénytelen opció: valamelyik érték várt ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Túl nagy: ${issue.origin ?? "érték"} mérete túl nagy ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elem"}`;
                return `Túl nagy: a bemeneti érték ${issue.origin ?? "érték"} túl nagy: ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Túl kicsi: a bemeneti érték ${issue.origin} mérete túl kicsi ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Túl kicsi: a bemeneti érték ${issue.origin} túl kicsi ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Érvénytelen string: "${_issue.prefix}" értékkel kell kezdődnie`;
                if (_issue.format === "ends_with")
                    return `Érvénytelen string: "${_issue.suffix}" értékkel kell végződnie`;
                if (_issue.format === "includes")
                    return `Érvénytelen string: "${_issue.includes}" értéket kell tartalmaznia`;
                if (_issue.format === "regex")
                    return `Érvénytelen string: ${_issue.pattern} mintának kell megfelelnie`;
                return `Érvénytelen ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Érvénytelen szám: ${issue.divisor} többszörösének kell lennie`;
            case "unrecognized_keys":
                return `Ismeretlen kulcs${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Érvénytelen kulcs ${issue.origin}`;
            case "invalid_union":
                return "Érvénytelen bemenet";
            case "invalid_element":
                return `Érvénytelen érték: ${issue.origin}`;
            default:
                return `Érvénytelen bemenet`;
        }
    };
};
/* harmony default export */ function hu() {
    return {
        localeError: hu_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/id.js

const id_error = () => {
    const Sizable = {
        string: { unit: "karakter", verb: "memiliki" },
        file: { unit: "byte", verb: "memiliki" },
        array: { unit: "item", verb: "memiliki" },
        set: { unit: "item", verb: "memiliki" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "input",
        email: "alamat email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "tanggal dan waktu format ISO",
        date: "tanggal format ISO",
        time: "jam format ISO",
        duration: "durasi format ISO",
        ipv4: "alamat IPv4",
        ipv6: "alamat IPv6",
        cidrv4: "rentang alamat IPv4",
        cidrv6: "rentang alamat IPv6",
        base64: "string dengan enkode base64",
        base64url: "string dengan enkode base64url",
        json_string: "string JSON",
        e164: "angka E.164",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Input tidak valid: diharapkan ${issue.expected}, diterima ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Input tidak valid: diharapkan ${util.stringifyPrimitive(issue.values[0])}`;
                return `Pilihan tidak valid: diharapkan salah satu dari ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Terlalu besar: diharapkan ${issue.origin ?? "value"} memiliki ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elemen"}`;
                return `Terlalu besar: diharapkan ${issue.origin ?? "value"} menjadi ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Terlalu kecil: diharapkan ${issue.origin} memiliki ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Terlalu kecil: diharapkan ${issue.origin} menjadi ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `String tidak valid: harus menyertakan "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} tidak valid`;
            }
            case "not_multiple_of":
                return `Angka tidak valid: harus kelipatan dari ${issue.divisor}`;
            case "unrecognized_keys":
                return `Kunci tidak dikenali ${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Kunci tidak valid di ${issue.origin}`;
            case "invalid_union":
                return "Input tidak valid";
            case "invalid_element":
                return `Nilai tidak valid di ${issue.origin}`;
            default:
                return `Input tidak valid`;
        }
    };
};
/* harmony default export */ function id() {
    return {
        localeError: id_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/it.js

const it_error = () => {
    const Sizable = {
        string: { unit: "caratteri", verb: "avere" },
        file: { unit: "byte", verb: "avere" },
        array: { unit: "elementi", verb: "avere" },
        set: { unit: "elementi", verb: "avere" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "numero";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "vettore";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "input",
        email: "indirizzo email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data e ora ISO",
        date: "data ISO",
        time: "ora ISO",
        duration: "durata ISO",
        ipv4: "indirizzo IPv4",
        ipv6: "indirizzo IPv6",
        cidrv4: "intervallo IPv4",
        cidrv6: "intervallo IPv6",
        base64: "stringa codificata in base64",
        base64url: "URL codificata in base64",
        json_string: "stringa JSON",
        e164: "numero E.164",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Input non valido: atteso ${issue.expected}, ricevuto ${parsedType(issue.input)}`;
            // return `Input non valido: atteso ${issue.expected}, ricevuto ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Input non valido: atteso ${util.stringifyPrimitive(issue.values[0])}`;
                return `Opzione non valida: atteso uno tra ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Troppo grande: ${issue.origin ?? "valore"} deve avere ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementi"}`;
                return `Troppo grande: ${issue.origin ?? "valore"} deve essere ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Troppo piccolo: ${issue.origin} deve avere ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Troppo piccolo: ${issue.origin} deve essere ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Stringa non valida: deve includere "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
                return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Numero non valido: deve essere un multiplo di ${issue.divisor}`;
            case "unrecognized_keys":
                return `Chiav${issue.keys.length > 1 ? "i" : "e"} non riconosciut${issue.keys.length > 1 ? "e" : "a"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Chiave non valida in ${issue.origin}`;
            case "invalid_union":
                return "Input non valido";
            case "invalid_element":
                return `Valore non valido in ${issue.origin}`;
            default:
                return `Input non valido`;
        }
    };
};
/* harmony default export */ function it() {
    return {
        localeError: it_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ja.js

const ja_error = () => {
    const Sizable = {
        string: { unit: "文字", verb: "である" },
        file: { unit: "バイト", verb: "である" },
        array: { unit: "要素", verb: "である" },
        set: { unit: "要素", verb: "である" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "数値";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "配列";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "入力値",
        email: "メールアドレス",
        url: "URL",
        emoji: "絵文字",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO日時",
        date: "ISO日付",
        time: "ISO時刻",
        duration: "ISO期間",
        ipv4: "IPv4アドレス",
        ipv6: "IPv6アドレス",
        cidrv4: "IPv4範囲",
        cidrv6: "IPv6範囲",
        base64: "base64エンコード文字列",
        base64url: "base64urlエンコード文字列",
        json_string: "JSON文字列",
        e164: "E.164番号",
        jwt: "JWT",
        template_literal: "入力値",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `無効な入力: ${issue.expected}が期待されましたが、${parsedType(issue.input)}が入力されました`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `無効な入力: ${util.stringifyPrimitive(issue.values[0])}が期待されました`;
                return `無効な選択: ${util.joinValues(issue.values, "、")}のいずれかである必要があります`;
            case "too_big": {
                const adj = issue.inclusive ? "以下である" : "より小さい";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `大きすぎる値: ${issue.origin ?? "値"}は${issue.maximum.toString()}${sizing.unit ?? "要素"}${adj}必要があります`;
                return `大きすぎる値: ${issue.origin ?? "値"}は${issue.maximum.toString()}${adj}必要があります`;
            }
            case "too_small": {
                const adj = issue.inclusive ? "以上である" : "より大きい";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `小さすぎる値: ${issue.origin}は${issue.minimum.toString()}${sizing.unit}${adj}必要があります`;
                return `小さすぎる値: ${issue.origin}は${issue.minimum.toString()}${adj}必要があります`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `無効な文字列: "${_issue.prefix}"で始まる必要があります`;
                if (_issue.format === "ends_with")
                    return `無効な文字列: "${_issue.suffix}"で終わる必要があります`;
                if (_issue.format === "includes")
                    return `無効な文字列: "${_issue.includes}"を含む必要があります`;
                if (_issue.format === "regex")
                    return `無効な文字列: パターン${_issue.pattern}に一致する必要があります`;
                return `無効な${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `無効な数値: ${issue.divisor}の倍数である必要があります`;
            case "unrecognized_keys":
                return `認識されていないキー${issue.keys.length > 1 ? "群" : ""}: ${util.joinValues(issue.keys, "、")}`;
            case "invalid_key":
                return `${issue.origin}内の無効なキー`;
            case "invalid_union":
                return "無効な入力";
            case "invalid_element":
                return `${issue.origin}内の無効な値`;
            default:
                return `無効な入力`;
        }
    };
};
/* harmony default export */ function ja() {
    return {
        localeError: ja_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/kh.js

const kh_error = () => {
    const Sizable = {
        string: { unit: "តួអក្សរ", verb: "គួរមាន" },
        file: { unit: "បៃ", verb: "គួរមាន" },
        array: { unit: "ធាតុ", verb: "គួរមាន" },
        set: { unit: "ធាតុ", verb: "គួរមាន" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "មិនមែនជាលេខ (NaN)" : "លេខ";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "អារេ (Array)";
                }
                if (data === null) {
                    return "គ្មានតម្លៃ (null)";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ទិន្នន័យបញ្ចូល",
        email: "អាសយដ្ឋានអ៊ីមែល",
        url: "URL",
        emoji: "សញ្ញាអារម្មណ៍",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
        date: "កាលបរិច្ឆេទ ISO",
        time: "ម៉ោង ISO",
        duration: "រយៈពេល ISO",
        ipv4: "អាសយដ្ឋាន IPv4",
        ipv6: "អាសយដ្ឋាន IPv6",
        cidrv4: "ដែនអាសយដ្ឋាន IPv4",
        cidrv6: "ដែនអាសយដ្ឋាន IPv6",
        base64: "ខ្សែអក្សរអ៊ិកូដ base64",
        base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
        json_string: "ខ្សែអក្សរ JSON",
        e164: "លេខ E.164",
        jwt: "JWT",
        template_literal: "ទិន្នន័យបញ្ចូល",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${issue.expected} ប៉ុន្តែទទួលបាន ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${util.stringifyPrimitive(issue.values[0])}`;
                return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `ធំពេក៖ ត្រូវការ ${issue.origin ?? "តម្លៃ"} ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "ធាតុ"}`;
                return `ធំពេក៖ ត្រូវការ ${issue.origin ?? "តម្លៃ"} ${adj} ${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `តូចពេក៖ ត្រូវការ ${issue.origin} ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `តូចពេក៖ ត្រូវការ ${issue.origin} ${adj} ${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${_issue.pattern}`;
                return `មិនត្រឹមត្រូវ៖ ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${issue.divisor}`;
            case "unrecognized_keys":
                return `រកឃើញសោមិនស្គាល់៖ ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `សោមិនត្រឹមត្រូវនៅក្នុង ${issue.origin}`;
            case "invalid_union":
                return `ទិន្នន័យមិនត្រឹមត្រូវ`;
            case "invalid_element":
                return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${issue.origin}`;
            default:
                return `ទិន្នន័យមិនត្រឹមត្រូវ`;
        }
    };
};
/* harmony default export */ function kh() {
    return {
        localeError: kh_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ko.js

const ko_error = () => {
    const Sizable = {
        string: { unit: "문자", verb: "to have" },
        file: { unit: "바이트", verb: "to have" },
        array: { unit: "개", verb: "to have" },
        set: { unit: "개", verb: "to have" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "입력",
        email: "이메일 주소",
        url: "URL",
        emoji: "이모지",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO 날짜시간",
        date: "ISO 날짜",
        time: "ISO 시간",
        duration: "ISO 기간",
        ipv4: "IPv4 주소",
        ipv6: "IPv6 주소",
        cidrv4: "IPv4 범위",
        cidrv6: "IPv6 범위",
        base64: "base64 인코딩 문자열",
        base64url: "base64url 인코딩 문자열",
        json_string: "JSON 문자열",
        e164: "E.164 번호",
        jwt: "JWT",
        template_literal: "입력",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `잘못된 입력: 예상 타입은 ${issue.expected}, 받은 타입은 ${parsedType(issue.input)}입니다`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `잘못된 입력: 값은 ${util.stringifyPrimitive(issue.values[0])} 이어야 합니다`;
                return `잘못된 옵션: ${util.joinValues(issue.values, "또는 ")} 중 하나여야 합니다`;
            case "too_big": {
                const adj = issue.inclusive ? "이하" : "미만";
                const suffix = adj === "미만" ? "이어야 합니다" : "여야 합니다";
                const sizing = getSizing(issue.origin);
                const unit = sizing?.unit ?? "요소";
                if (sizing)
                    return `${issue.origin ?? "값"}이 너무 큽니다: ${issue.maximum.toString()}${unit} ${adj}${suffix}`;
                return `${issue.origin ?? "값"}이 너무 큽니다: ${issue.maximum.toString()} ${adj}${suffix}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? "이상" : "초과";
                const suffix = adj === "이상" ? "이어야 합니다" : "여야 합니다";
                const sizing = getSizing(issue.origin);
                const unit = sizing?.unit ?? "요소";
                if (sizing) {
                    return `${issue.origin ?? "값"}이 너무 작습니다: ${issue.minimum.toString()}${unit} ${adj}${suffix}`;
                }
                return `${issue.origin ?? "값"}이 너무 작습니다: ${issue.minimum.toString()} ${adj}${suffix}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `잘못된 문자열: "${_issue.prefix}"(으)로 시작해야 합니다`;
                }
                if (_issue.format === "ends_with")
                    return `잘못된 문자열: "${_issue.suffix}"(으)로 끝나야 합니다`;
                if (_issue.format === "includes")
                    return `잘못된 문자열: "${_issue.includes}"을(를) 포함해야 합니다`;
                if (_issue.format === "regex")
                    return `잘못된 문자열: 정규식 ${_issue.pattern} 패턴과 일치해야 합니다`;
                return `잘못된 ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `잘못된 숫자: ${issue.divisor}의 배수여야 합니다`;
            case "unrecognized_keys":
                return `인식할 수 없는 키: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `잘못된 키: ${issue.origin}`;
            case "invalid_union":
                return `잘못된 입력`;
            case "invalid_element":
                return `잘못된 값: ${issue.origin}`;
            default:
                return `잘못된 입력`;
        }
    };
};
/* harmony default export */ function ko() {
    return {
        localeError: ko_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/mk.js

const mk_error = () => {
    const Sizable = {
        string: { unit: "знаци", verb: "да имаат" },
        file: { unit: "бајти", verb: "да имаат" },
        array: { unit: "ставки", verb: "да имаат" },
        set: { unit: "ставки", verb: "да имаат" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "број";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "низа";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "внес",
        email: "адреса на е-пошта",
        url: "URL",
        emoji: "емоџи",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO датум и време",
        date: "ISO датум",
        time: "ISO време",
        duration: "ISO времетраење",
        ipv4: "IPv4 адреса",
        ipv6: "IPv6 адреса",
        cidrv4: "IPv4 опсег",
        cidrv6: "IPv6 опсег",
        base64: "base64-енкодирана низа",
        base64url: "base64url-енкодирана низа",
        json_string: "JSON низа",
        e164: "E.164 број",
        jwt: "JWT",
        template_literal: "внес",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Грешен внес: се очекува ${issue.expected}, примено ${parsedType(issue.input)}`;
            // return `Invalid input: expected ${issue.expected}, received ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Invalid input: expected ${util.stringifyPrimitive(issue.values[0])}`;
                return `Грешана опција: се очекува една ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Премногу голем: се очекува ${issue.origin ?? "вредноста"} да има ${adj}${issue.maximum.toString()} ${sizing.unit ?? "елементи"}`;
                return `Премногу голем: се очекува ${issue.origin ?? "вредноста"} да биде ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Премногу мал: се очекува ${issue.origin} да има ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Премногу мал: се очекува ${issue.origin} да биде ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Неважечка низа: мора да започнува со "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Неважечка низа: мора да завршува со "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Неважечка низа: мора да вклучува "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Неважечка низа: мора да одгоара на патернот ${_issue.pattern}`;
                return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Грешен број: мора да биде делив со ${issue.divisor}`;
            case "unrecognized_keys":
                return `${issue.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Грешен клуч во ${issue.origin}`;
            case "invalid_union":
                return "Грешен внес";
            case "invalid_element":
                return `Грешна вредност во ${issue.origin}`;
            default:
                return `Грешен внес`;
        }
    };
};
/* harmony default export */ function mk() {
    return {
        localeError: mk_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ms.js

const ms_error = () => {
    const Sizable = {
        string: { unit: "aksara", verb: "mempunyai" },
        file: { unit: "bait", verb: "mempunyai" },
        array: { unit: "elemen", verb: "mempunyai" },
        set: { unit: "elemen", verb: "mempunyai" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "nombor";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "input",
        email: "alamat e-mel",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "tarikh masa ISO",
        date: "tarikh ISO",
        time: "masa ISO",
        duration: "tempoh ISO",
        ipv4: "alamat IPv4",
        ipv6: "alamat IPv6",
        cidrv4: "julat IPv4",
        cidrv6: "julat IPv6",
        base64: "string dikodkan base64",
        base64url: "string dikodkan base64url",
        json_string: "string JSON",
        e164: "nombor E.164",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Input tidak sah: dijangka ${issue.expected}, diterima ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Input tidak sah: dijangka ${util.stringifyPrimitive(issue.values[0])}`;
                return `Pilihan tidak sah: dijangka salah satu daripada ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Terlalu besar: dijangka ${issue.origin ?? "nilai"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elemen"}`;
                return `Terlalu besar: dijangka ${issue.origin ?? "nilai"} adalah ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Terlalu kecil: dijangka ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Terlalu kecil: dijangka ${issue.origin} adalah ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} tidak sah`;
            }
            case "not_multiple_of":
                return `Nombor tidak sah: perlu gandaan ${issue.divisor}`;
            case "unrecognized_keys":
                return `Kunci tidak dikenali: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Kunci tidak sah dalam ${issue.origin}`;
            case "invalid_union":
                return "Input tidak sah";
            case "invalid_element":
                return `Nilai tidak sah dalam ${issue.origin}`;
            default:
                return `Input tidak sah`;
        }
    };
};
/* harmony default export */ function ms() {
    return {
        localeError: ms_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/nl.js

const nl_error = () => {
    const Sizable = {
        string: { unit: "tekens" },
        file: { unit: "bytes" },
        array: { unit: "elementen" },
        set: { unit: "elementen" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "getal";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "invoer",
        email: "emailadres",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datum en tijd",
        date: "ISO datum",
        time: "ISO tijd",
        duration: "ISO duur",
        ipv4: "IPv4-adres",
        ipv6: "IPv6-adres",
        cidrv4: "IPv4-bereik",
        cidrv6: "IPv6-bereik",
        base64: "base64-gecodeerde tekst",
        base64url: "base64 URL-gecodeerde tekst",
        json_string: "JSON string",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "invoer",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Ongeldige invoer: verwacht ${issue.expected}, ontving ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Ongeldige invoer: verwacht ${util.stringifyPrimitive(issue.values[0])}`;
                return `Ongeldige optie: verwacht één van ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Te lang: verwacht dat ${issue.origin ?? "waarde"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementen"} bevat`;
                return `Te lang: verwacht dat ${issue.origin ?? "waarde"} ${adj}${issue.maximum.toString()} is`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Te kort: verwacht dat ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} bevat`;
                }
                return `Te kort: verwacht dat ${issue.origin} ${adj}${issue.minimum.toString()} is`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
                }
                if (_issue.format === "ends_with")
                    return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
                if (_issue.format === "includes")
                    return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
                if (_issue.format === "regex")
                    return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
                return `Ongeldig: ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Ongeldig getal: moet een veelvoud van ${issue.divisor} zijn`;
            case "unrecognized_keys":
                return `Onbekende key${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Ongeldige key in ${issue.origin}`;
            case "invalid_union":
                return "Ongeldige invoer";
            case "invalid_element":
                return `Ongeldige waarde in ${issue.origin}`;
            default:
                return `Ongeldige invoer`;
        }
    };
};
/* harmony default export */ function nl() {
    return {
        localeError: nl_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/no.js

const no_error = () => {
    const Sizable = {
        string: { unit: "tegn", verb: "å ha" },
        file: { unit: "bytes", verb: "å ha" },
        array: { unit: "elementer", verb: "å inneholde" },
        set: { unit: "elementer", verb: "å inneholde" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "tall";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "liste";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "input",
        email: "e-postadresse",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO dato- og klokkeslett",
        date: "ISO-dato",
        time: "ISO-klokkeslett",
        duration: "ISO-varighet",
        ipv4: "IPv4-område",
        ipv6: "IPv6-område",
        cidrv4: "IPv4-spekter",
        cidrv6: "IPv6-spekter",
        base64: "base64-enkodet streng",
        base64url: "base64url-enkodet streng",
        json_string: "JSON-streng",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Ugyldig input: forventet ${issue.expected}, fikk ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Ugyldig verdi: forventet ${util.stringifyPrimitive(issue.values[0])}`;
                return `Ugyldig valg: forventet en av ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `For stor(t): forventet ${issue.origin ?? "value"} til å ha ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementer"}`;
                return `For stor(t): forventet ${issue.origin ?? "value"} til å ha ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `For lite(n): forventet ${issue.origin} til å ha ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `For lite(n): forventet ${issue.origin} til å ha ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Ugyldig streng: må starte med "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Ugyldig streng: må ende med "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Ugyldig streng: må inneholde "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Ugyldig streng: må matche mønsteret ${_issue.pattern}`;
                return `Ugyldig ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Ugyldig tall: må være et multiplum av ${issue.divisor}`;
            case "unrecognized_keys":
                return `${issue.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Ugyldig nøkkel i ${issue.origin}`;
            case "invalid_union":
                return "Ugyldig input";
            case "invalid_element":
                return `Ugyldig verdi i ${issue.origin}`;
            default:
                return `Ugyldig input`;
        }
    };
};
/* harmony default export */ function no() {
    return {
        localeError: no_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ota.js

const ota_error = () => {
    const Sizable = {
        string: { unit: "harf", verb: "olmalıdır" },
        file: { unit: "bayt", verb: "olmalıdır" },
        array: { unit: "unsur", verb: "olmalıdır" },
        set: { unit: "unsur", verb: "olmalıdır" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "numara";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "saf";
                }
                if (data === null) {
                    return "gayb";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "giren",
        email: "epostagâh",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO hengâmı",
        date: "ISO tarihi",
        time: "ISO zamanı",
        duration: "ISO müddeti",
        ipv4: "IPv4 nişânı",
        ipv6: "IPv6 nişânı",
        cidrv4: "IPv4 menzili",
        cidrv6: "IPv6 menzili",
        base64: "base64-şifreli metin",
        base64url: "base64url-şifreli metin",
        json_string: "JSON metin",
        e164: "E.164 sayısı",
        jwt: "JWT",
        template_literal: "giren",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Fâsit giren: umulan ${issue.expected}, alınan ${parsedType(issue.input)}`;
            // return `Fâsit giren: umulan ${issue.expected}, alınan ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Fâsit giren: umulan ${util.stringifyPrimitive(issue.values[0])}`;
                return `Fâsit tercih: mûteberler ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Fazla büyük: ${issue.origin ?? "value"}, ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmalıydı.`;
                return `Fazla büyük: ${issue.origin ?? "value"}, ${adj}${issue.maximum.toString()} olmalıydı.`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Fazla küçük: ${issue.origin}, ${adj}${issue.minimum.toString()} ${sizing.unit} sahip olmalıydı.`;
                }
                return `Fazla küçük: ${issue.origin}, ${adj}${issue.minimum.toString()} olmalıydı.`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Fâsit metin: "${_issue.prefix}" ile başlamalı.`;
                if (_issue.format === "ends_with")
                    return `Fâsit metin: "${_issue.suffix}" ile bitmeli.`;
                if (_issue.format === "includes")
                    return `Fâsit metin: "${_issue.includes}" ihtivâ etmeli.`;
                if (_issue.format === "regex")
                    return `Fâsit metin: ${_issue.pattern} nakşına uymalı.`;
                return `Fâsit ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Fâsit sayı: ${issue.divisor} katı olmalıydı.`;
            case "unrecognized_keys":
                return `Tanınmayan anahtar ${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `${issue.origin} için tanınmayan anahtar var.`;
            case "invalid_union":
                return "Giren tanınamadı.";
            case "invalid_element":
                return `${issue.origin} için tanınmayan kıymet var.`;
            default:
                return `Kıymet tanınamadı.`;
        }
    };
};
/* harmony default export */ function ota() {
    return {
        localeError: ota_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ps.js

const ps_error = () => {
    const Sizable = {
        string: { unit: "توکي", verb: "ولري" },
        file: { unit: "بایټس", verb: "ولري" },
        array: { unit: "توکي", verb: "ولري" },
        set: { unit: "توکي", verb: "ولري" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "عدد";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "ارې";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ورودي",
        email: "بریښنالیک",
        url: "یو آر ال",
        emoji: "ایموجي",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "نیټه او وخت",
        date: "نېټه",
        time: "وخت",
        duration: "موده",
        ipv4: "د IPv4 پته",
        ipv6: "د IPv6 پته",
        cidrv4: "د IPv4 ساحه",
        cidrv6: "د IPv6 ساحه",
        base64: "base64-encoded متن",
        base64url: "base64url-encoded متن",
        json_string: "JSON متن",
        e164: "د E.164 شمېره",
        jwt: "JWT",
        template_literal: "ورودي",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `ناسم ورودي: باید ${issue.expected} وای, مګر ${parsedType(issue.input)} ترلاسه شو`;
            case "invalid_value":
                if (issue.values.length === 1) {
                    return `ناسم ورودي: باید ${util.stringifyPrimitive(issue.values[0])} وای`;
                }
                return `ناسم انتخاب: باید یو له ${util.joinValues(issue.values, "|")} څخه وای`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `ډیر لوی: ${issue.origin ?? "ارزښت"} باید ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عنصرونه"} ولري`;
                }
                return `ډیر لوی: ${issue.origin ?? "ارزښت"} باید ${adj}${issue.maximum.toString()} وي`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `ډیر کوچنی: ${issue.origin} باید ${adj}${issue.minimum.toString()} ${sizing.unit} ولري`;
                }
                return `ډیر کوچنی: ${issue.origin} باید ${adj}${issue.minimum.toString()} وي`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `ناسم متن: باید د "${_issue.prefix}" سره پیل شي`;
                }
                if (_issue.format === "ends_with") {
                    return `ناسم متن: باید د "${_issue.suffix}" سره پای ته ورسيږي`;
                }
                if (_issue.format === "includes") {
                    return `ناسم متن: باید "${_issue.includes}" ولري`;
                }
                if (_issue.format === "regex") {
                    return `ناسم متن: باید د ${_issue.pattern} سره مطابقت ولري`;
                }
                return `${Nouns[_issue.format] ?? issue.format} ناسم دی`;
            }
            case "not_multiple_of":
                return `ناسم عدد: باید د ${issue.divisor} مضرب وي`;
            case "unrecognized_keys":
                return `ناسم ${issue.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `ناسم کلیډ په ${issue.origin} کې`;
            case "invalid_union":
                return `ناسمه ورودي`;
            case "invalid_element":
                return `ناسم عنصر په ${issue.origin} کې`;
            default:
                return `ناسمه ورودي`;
        }
    };
};
/* harmony default export */ function ps() {
    return {
        localeError: ps_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/pl.js

const pl_error = () => {
    const Sizable = {
        string: { unit: "znaków", verb: "mieć" },
        file: { unit: "bajtów", verb: "mieć" },
        array: { unit: "elementów", verb: "mieć" },
        set: { unit: "elementów", verb: "mieć" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "liczba";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "tablica";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "wyrażenie",
        email: "adres email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data i godzina w formacie ISO",
        date: "data w formacie ISO",
        time: "godzina w formacie ISO",
        duration: "czas trwania ISO",
        ipv4: "adres IPv4",
        ipv6: "adres IPv6",
        cidrv4: "zakres IPv4",
        cidrv6: "zakres IPv6",
        base64: "ciąg znaków zakodowany w formacie base64",
        base64url: "ciąg znaków zakodowany w formacie base64url",
        json_string: "ciąg znaków w formacie JSON",
        e164: "liczba E.164",
        jwt: "JWT",
        template_literal: "wejście",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Nieprawidłowe dane wejściowe: oczekiwano ${issue.expected}, otrzymano ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Nieprawidłowe dane wejściowe: oczekiwano ${util.stringifyPrimitive(issue.values[0])}`;
                return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Za duża wartość: oczekiwano, że ${issue.origin ?? "wartość"} będzie mieć ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementów"}`;
                }
                return `Zbyt duż(y/a/e): oczekiwano, że ${issue.origin ?? "wartość"} będzie wynosić ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Za mała wartość: oczekiwano, że ${issue.origin ?? "wartość"} będzie mieć ${adj}${issue.minimum.toString()} ${sizing.unit ?? "elementów"}`;
                }
                return `Zbyt mał(y/a/e): oczekiwano, że ${issue.origin ?? "wartość"} będzie wynosić ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Nieprawidłowy ciąg znaków: musi zaczynać się od "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Nieprawidłowy ciąg znaków: musi kończyć się na "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Nieprawidłowy ciąg znaków: musi zawierać "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Nieprawidłowy ciąg znaków: musi odpowiadać wzorcowi ${_issue.pattern}`;
                return `Nieprawidłow(y/a/e) ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Nieprawidłowa liczba: musi być wielokrotnością ${issue.divisor}`;
            case "unrecognized_keys":
                return `Nierozpoznane klucze${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Nieprawidłowy klucz w ${issue.origin}`;
            case "invalid_union":
                return "Nieprawidłowe dane wejściowe";
            case "invalid_element":
                return `Nieprawidłowa wartość w ${issue.origin}`;
            default:
                return `Nieprawidłowe dane wejściowe`;
        }
    };
};
/* harmony default export */ function pl() {
    return {
        localeError: pl_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/pt.js

const pt_error = () => {
    const Sizable = {
        string: { unit: "caracteres", verb: "ter" },
        file: { unit: "bytes", verb: "ter" },
        array: { unit: "itens", verb: "ter" },
        set: { unit: "itens", verb: "ter" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "número";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "nulo";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "padrão",
        email: "endereço de e-mail",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data e hora ISO",
        date: "data ISO",
        time: "hora ISO",
        duration: "duração ISO",
        ipv4: "endereço IPv4",
        ipv6: "endereço IPv6",
        cidrv4: "faixa de IPv4",
        cidrv6: "faixa de IPv6",
        base64: "texto codificado em base64",
        base64url: "URL codificada em base64",
        json_string: "texto JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Tipo inválido: esperado ${issue.expected}, recebido ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Entrada inválida: esperado ${util.stringifyPrimitive(issue.values[0])}`;
                return `Opção inválida: esperada uma das ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Muito grande: esperado que ${issue.origin ?? "valor"} tivesse ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementos"}`;
                return `Muito grande: esperado que ${issue.origin ?? "valor"} fosse ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Muito pequeno: esperado que ${issue.origin} tivesse ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Muito pequeno: esperado que ${issue.origin} fosse ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Texto inválido: deve começar com "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Texto inválido: deve terminar com "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Texto inválido: deve incluir "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Texto inválido: deve corresponder ao padrão ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} inválido`;
            }
            case "not_multiple_of":
                return `Número inválido: deve ser múltiplo de ${issue.divisor}`;
            case "unrecognized_keys":
                return `Chave${issue.keys.length > 1 ? "s" : ""} desconhecida${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Chave inválida em ${issue.origin}`;
            case "invalid_union":
                return "Entrada inválida";
            case "invalid_element":
                return `Valor inválido em ${issue.origin}`;
            default:
                return `Campo inválido`;
        }
    };
};
/* harmony default export */ function pt() {
    return {
        localeError: pt_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ru.js

function getRussianPlural(count, one, few, many) {
    const absCount = Math.abs(count);
    const lastDigit = absCount % 10;
    const lastTwoDigits = absCount % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return many;
    }
    if (lastDigit === 1) {
        return one;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
        return few;
    }
    return many;
}
const ru_error = () => {
    const Sizable = {
        string: {
            unit: {
                one: "символ",
                few: "символа",
                many: "символов",
            },
            verb: "иметь",
        },
        file: {
            unit: {
                one: "байт",
                few: "байта",
                many: "байт",
            },
            verb: "иметь",
        },
        array: {
            unit: {
                one: "элемент",
                few: "элемента",
                many: "элементов",
            },
            verb: "иметь",
        },
        set: {
            unit: {
                one: "элемент",
                few: "элемента",
                many: "элементов",
            },
            verb: "иметь",
        },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "число";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "массив";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ввод",
        email: "email адрес",
        url: "URL",
        emoji: "эмодзи",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO дата и время",
        date: "ISO дата",
        time: "ISO время",
        duration: "ISO длительность",
        ipv4: "IPv4 адрес",
        ipv6: "IPv6 адрес",
        cidrv4: "IPv4 диапазон",
        cidrv6: "IPv6 диапазон",
        base64: "строка в формате base64",
        base64url: "строка в формате base64url",
        json_string: "JSON строка",
        e164: "номер E.164",
        jwt: "JWT",
        template_literal: "ввод",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Неверный ввод: ожидалось ${issue.expected}, получено ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Неверный ввод: ожидалось ${util.stringifyPrimitive(issue.values[0])}`;
                return `Неверный вариант: ожидалось одно из ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    const maxValue = Number(issue.maximum);
                    const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
                    return `Слишком большое значение: ожидалось, что ${issue.origin ?? "значение"} будет иметь ${adj}${issue.maximum.toString()} ${unit}`;
                }
                return `Слишком большое значение: ожидалось, что ${issue.origin ?? "значение"} будет ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    const minValue = Number(issue.minimum);
                    const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
                    return `Слишком маленькое значение: ожидалось, что ${issue.origin} будет иметь ${adj}${issue.minimum.toString()} ${unit}`;
                }
                return `Слишком маленькое значение: ожидалось, что ${issue.origin} будет ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Неверная строка: должна начинаться с "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Неверная строка: должна заканчиваться на "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Неверная строка: должна содержать "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Неверная строка: должна соответствовать шаблону ${_issue.pattern}`;
                return `Неверный ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Неверное число: должно быть кратным ${issue.divisor}`;
            case "unrecognized_keys":
                return `Нераспознанн${issue.keys.length > 1 ? "ые" : "ый"} ключ${issue.keys.length > 1 ? "и" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Неверный ключ в ${issue.origin}`;
            case "invalid_union":
                return "Неверные входные данные";
            case "invalid_element":
                return `Неверное значение в ${issue.origin}`;
            default:
                return `Неверные входные данные`;
        }
    };
};
/* harmony default export */ function ru() {
    return {
        localeError: ru_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/sl.js

const sl_error = () => {
    const Sizable = {
        string: { unit: "znakov", verb: "imeti" },
        file: { unit: "bajtov", verb: "imeti" },
        array: { unit: "elementov", verb: "imeti" },
        set: { unit: "elementov", verb: "imeti" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "število";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "tabela";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "vnos",
        email: "e-poštni naslov",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datum in čas",
        date: "ISO datum",
        time: "ISO čas",
        duration: "ISO trajanje",
        ipv4: "IPv4 naslov",
        ipv6: "IPv6 naslov",
        cidrv4: "obseg IPv4",
        cidrv6: "obseg IPv6",
        base64: "base64 kodiran niz",
        base64url: "base64url kodiran niz",
        json_string: "JSON niz",
        e164: "E.164 številka",
        jwt: "JWT",
        template_literal: "vnos",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Neveljaven vnos: pričakovano ${issue.expected}, prejeto ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Neveljaven vnos: pričakovano ${util.stringifyPrimitive(issue.values[0])}`;
                return `Neveljavna možnost: pričakovano eno izmed ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Preveliko: pričakovano, da bo ${issue.origin ?? "vrednost"} imelo ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementov"}`;
                return `Preveliko: pričakovano, da bo ${issue.origin ?? "vrednost"} ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Premajhno: pričakovano, da bo ${issue.origin} imelo ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Premajhno: pričakovano, da bo ${issue.origin} ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Neveljaven niz: mora se začeti z "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Neveljaven niz: mora se končati z "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
                return `Neveljaven ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Neveljavno število: mora biti večkratnik ${issue.divisor}`;
            case "unrecognized_keys":
                return `Neprepoznan${issue.keys.length > 1 ? "i ključi" : " ključ"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Neveljaven ključ v ${issue.origin}`;
            case "invalid_union":
                return "Neveljaven vnos";
            case "invalid_element":
                return `Neveljavna vrednost v ${issue.origin}`;
            default:
                return "Neveljaven vnos";
        }
    };
};
/* harmony default export */ function sl() {
    return {
        localeError: sl_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/sv.js

const sv_error = () => {
    const Sizable = {
        string: { unit: "tecken", verb: "att ha" },
        file: { unit: "bytes", verb: "att ha" },
        array: { unit: "objekt", verb: "att innehålla" },
        set: { unit: "objekt", verb: "att innehålla" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "antal";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "lista";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "reguljärt uttryck",
        email: "e-postadress",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-datum och tid",
        date: "ISO-datum",
        time: "ISO-tid",
        duration: "ISO-varaktighet",
        ipv4: "IPv4-intervall",
        ipv6: "IPv6-intervall",
        cidrv4: "IPv4-spektrum",
        cidrv6: "IPv6-spektrum",
        base64: "base64-kodad sträng",
        base64url: "base64url-kodad sträng",
        json_string: "JSON-sträng",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "mall-literal",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Ogiltig inmatning: förväntat ${issue.expected}, fick ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Ogiltig inmatning: förväntat ${util.stringifyPrimitive(issue.values[0])}`;
                return `Ogiltigt val: förväntade en av ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `För stor(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.maximum.toString()} ${sizing.unit ?? "element"}`;
                }
                return `För stor(t): förväntat ${issue.origin ?? "värdet"} att ha ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `För lite(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `För lite(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `Ogiltig sträng: måste börja med "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `Ogiltig sträng: måste sluta med "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Ogiltig sträng: måste innehålla "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Ogiltig sträng: måste matcha mönstret "${_issue.pattern}"`;
                return `Ogiltig(t) ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Ogiltigt tal: måste vara en multipel av ${issue.divisor}`;
            case "unrecognized_keys":
                return `${issue.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Ogiltig nyckel i ${issue.origin ?? "värdet"}`;
            case "invalid_union":
                return "Ogiltig input";
            case "invalid_element":
                return `Ogiltigt värde i ${issue.origin ?? "värdet"}`;
            default:
                return `Ogiltig input`;
        }
    };
};
/* harmony default export */ function sv() {
    return {
        localeError: sv_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ta.js

const ta_error = () => {
    const Sizable = {
        string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
        file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
        array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
        set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "எண் அல்லாதது" : "எண்";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "அணி";
                }
                if (data === null) {
                    return "வெறுமை";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "உள்ளீடு",
        email: "மின்னஞ்சல் முகவரி",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO தேதி நேரம்",
        date: "ISO தேதி",
        time: "ISO நேரம்",
        duration: "ISO கால அளவு",
        ipv4: "IPv4 முகவரி",
        ipv6: "IPv6 முகவரி",
        cidrv4: "IPv4 வரம்பு",
        cidrv6: "IPv6 வரம்பு",
        base64: "base64-encoded சரம்",
        base64url: "base64url-encoded சரம்",
        json_string: "JSON சரம்",
        e164: "E.164 எண்",
        jwt: "JWT",
        template_literal: "input",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${issue.expected}, பெறப்பட்டது ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${util.stringifyPrimitive(issue.values[0])}`;
                return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${util.joinValues(issue.values, "|")} இல் ஒன்று`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue.origin ?? "மதிப்பு"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
                }
                return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue.origin ?? "மதிப்பு"} ${adj}${issue.maximum.toString()} ஆக இருக்க வேண்டும்`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} ஆக இருக்க வேண்டும்`; //
                }
                return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue.origin} ${adj}${issue.minimum.toString()} ஆக இருக்க வேண்டும்`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `தவறான சரம்: "${_issue.prefix}" இல் தொடங்க வேண்டும்`;
                if (_issue.format === "ends_with")
                    return `தவறான சரம்: "${_issue.suffix}" இல் முடிவடைய வேண்டும்`;
                if (_issue.format === "includes")
                    return `தவறான சரம்: "${_issue.includes}" ஐ உள்ளடக்க வேண்டும்`;
                if (_issue.format === "regex")
                    return `தவறான சரம்: ${_issue.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
                return `தவறான ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `தவறான எண்: ${issue.divisor} இன் பலமாக இருக்க வேண்டும்`;
            case "unrecognized_keys":
                return `அடையாளம் தெரியாத விசை${issue.keys.length > 1 ? "கள்" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `${issue.origin} இல் தவறான விசை`;
            case "invalid_union":
                return "தவறான உள்ளீடு";
            case "invalid_element":
                return `${issue.origin} இல் தவறான மதிப்பு`;
            default:
                return `தவறான உள்ளீடு`;
        }
    };
};
/* harmony default export */ function ta() {
    return {
        localeError: ta_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/th.js

const th_error = () => {
    const Sizable = {
        string: { unit: "ตัวอักษร", verb: "ควรมี" },
        file: { unit: "ไบต์", verb: "ควรมี" },
        array: { unit: "รายการ", verb: "ควรมี" },
        set: { unit: "รายการ", verb: "ควรมี" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "ไม่ใช่ตัวเลข (NaN)" : "ตัวเลข";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "อาร์เรย์ (Array)";
                }
                if (data === null) {
                    return "ไม่มีค่า (null)";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ข้อมูลที่ป้อน",
        email: "ที่อยู่อีเมล",
        url: "URL",
        emoji: "อิโมจิ",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "วันที่เวลาแบบ ISO",
        date: "วันที่แบบ ISO",
        time: "เวลาแบบ ISO",
        duration: "ช่วงเวลาแบบ ISO",
        ipv4: "ที่อยู่ IPv4",
        ipv6: "ที่อยู่ IPv6",
        cidrv4: "ช่วง IP แบบ IPv4",
        cidrv6: "ช่วง IP แบบ IPv6",
        base64: "ข้อความแบบ Base64",
        base64url: "ข้อความแบบ Base64 สำหรับ URL",
        json_string: "ข้อความแบบ JSON",
        e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
        jwt: "โทเคน JWT",
        template_literal: "ข้อมูลที่ป้อน",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${issue.expected} แต่ได้รับ ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `ค่าไม่ถูกต้อง: ควรเป็น ${util.stringifyPrimitive(issue.values[0])}`;
                return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "ไม่เกิน" : "น้อยกว่า";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `เกินกำหนด: ${issue.origin ?? "ค่า"} ควรมี${adj} ${issue.maximum.toString()} ${sizing.unit ?? "รายการ"}`;
                return `เกินกำหนด: ${issue.origin ?? "ค่า"} ควรมี${adj} ${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? "อย่างน้อย" : "มากกว่า";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `น้อยกว่ากำหนด: ${issue.origin} ควรมี${adj} ${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `น้อยกว่ากำหนด: ${issue.origin} ควรมี${adj} ${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${_issue.prefix}"`;
                }
                if (_issue.format === "ends_with")
                    return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${_issue.includes}" อยู่ในข้อความ`;
                if (_issue.format === "regex")
                    return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${_issue.pattern}`;
                return `รูปแบบไม่ถูกต้อง: ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${issue.divisor} ได้ลงตัว`;
            case "unrecognized_keys":
                return `พบคีย์ที่ไม่รู้จัก: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `คีย์ไม่ถูกต้องใน ${issue.origin}`;
            case "invalid_union":
                return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
            case "invalid_element":
                return `ข้อมูลไม่ถูกต้องใน ${issue.origin}`;
            default:
                return `ข้อมูลไม่ถูกต้อง`;
        }
    };
};
/* harmony default export */ function th() {
    return {
        localeError: th_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/tr.js

const tr_parsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "number": {
            return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
            if (Array.isArray(data)) {
                return "array";
            }
            if (data === null) {
                return "null";
            }
            if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                return data.constructor.name;
            }
        }
    }
    return t;
};
const tr_error = () => {
    const Sizable = {
        string: { unit: "karakter", verb: "olmalı" },
        file: { unit: "bayt", verb: "olmalı" },
        array: { unit: "öğe", verb: "olmalı" },
        set: { unit: "öğe", verb: "olmalı" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const Nouns = {
        regex: "girdi",
        email: "e-posta adresi",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO tarih ve saat",
        date: "ISO tarih",
        time: "ISO saat",
        duration: "ISO süre",
        ipv4: "IPv4 adresi",
        ipv6: "IPv6 adresi",
        cidrv4: "IPv4 aralığı",
        cidrv6: "IPv6 aralığı",
        base64: "base64 ile şifrelenmiş metin",
        base64url: "base64url ile şifrelenmiş metin",
        json_string: "JSON dizesi",
        e164: "E.164 sayısı",
        jwt: "JWT",
        template_literal: "Şablon dizesi",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Geçersiz değer: beklenen ${issue.expected}, alınan ${tr_parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Geçersiz değer: beklenen ${util.stringifyPrimitive(issue.values[0])}`;
                return `Geçersiz seçenek: aşağıdakilerden biri olmalı: ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Çok büyük: beklenen ${issue.origin ?? "değer"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "öğe"}`;
                return `Çok büyük: beklenen ${issue.origin ?? "değer"} ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Çok küçük: beklenen ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                return `Çok küçük: beklenen ${issue.origin} ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Geçersiz metin: "${_issue.prefix}" ile başlamalı`;
                if (_issue.format === "ends_with")
                    return `Geçersiz metin: "${_issue.suffix}" ile bitmeli`;
                if (_issue.format === "includes")
                    return `Geçersiz metin: "${_issue.includes}" içermeli`;
                if (_issue.format === "regex")
                    return `Geçersiz metin: ${_issue.pattern} desenine uymalı`;
                return `Geçersiz ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Geçersiz sayı: ${issue.divisor} ile tam bölünebilmeli`;
            case "unrecognized_keys":
                return `Tanınmayan anahtar${issue.keys.length > 1 ? "lar" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `${issue.origin} içinde geçersiz anahtar`;
            case "invalid_union":
                return "Geçersiz değer";
            case "invalid_element":
                return `${issue.origin} içinde geçersiz değer`;
            default:
                return `Geçersiz değer`;
        }
    };
};
/* harmony default export */ function tr() {
    return {
        localeError: tr_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ua.js

const ua_error = () => {
    const Sizable = {
        string: { unit: "символів", verb: "матиме" },
        file: { unit: "байтів", verb: "матиме" },
        array: { unit: "елементів", verb: "матиме" },
        set: { unit: "елементів", verb: "матиме" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "число";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "масив";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "вхідні дані",
        email: "адреса електронної пошти",
        url: "URL",
        emoji: "емодзі",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "дата та час ISO",
        date: "дата ISO",
        time: "час ISO",
        duration: "тривалість ISO",
        ipv4: "адреса IPv4",
        ipv6: "адреса IPv6",
        cidrv4: "діапазон IPv4",
        cidrv6: "діапазон IPv6",
        base64: "рядок у кодуванні base64",
        base64url: "рядок у кодуванні base64url",
        json_string: "рядок JSON",
        e164: "номер E.164",
        jwt: "JWT",
        template_literal: "вхідні дані",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Неправильні вхідні дані: очікується ${issue.expected}, отримано ${parsedType(issue.input)}`;
            // return `Неправильні вхідні дані: очікується ${issue.expected}, отримано ${util.getParsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Неправильні вхідні дані: очікується ${util.stringifyPrimitive(issue.values[0])}`;
                return `Неправильна опція: очікується одне з ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Занадто велике: очікується, що ${issue.origin ?? "значення"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "елементів"}`;
                return `Занадто велике: очікується, що ${issue.origin ?? "значення"} буде ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Занадто мале: очікується, що ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Занадто мале: очікується, що ${issue.origin} буде ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Неправильний рядок: повинен починатися з "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Неправильний рядок: повинен закінчуватися на "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Неправильний рядок: повинен містити "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Неправильний рядок: повинен відповідати шаблону ${_issue.pattern}`;
                return `Неправильний ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `Неправильне число: повинно бути кратним ${issue.divisor}`;
            case "unrecognized_keys":
                return `Нерозпізнаний ключ${issue.keys.length > 1 ? "і" : ""}: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Неправильний ключ у ${issue.origin}`;
            case "invalid_union":
                return "Неправильні вхідні дані";
            case "invalid_element":
                return `Неправильне значення у ${issue.origin}`;
            default:
                return `Неправильні вхідні дані`;
        }
    };
};
/* harmony default export */ function ua() {
    return {
        localeError: ua_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/ur.js

const ur_error = () => {
    const Sizable = {
        string: { unit: "حروف", verb: "ہونا" },
        file: { unit: "بائٹس", verb: "ہونا" },
        array: { unit: "آئٹمز", verb: "ہونا" },
        set: { unit: "آئٹمز", verb: "ہونا" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "نمبر";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "آرے";
                }
                if (data === null) {
                    return "نل";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "ان پٹ",
        email: "ای میل ایڈریس",
        url: "یو آر ایل",
        emoji: "ایموجی",
        uuid: "یو یو آئی ڈی",
        uuidv4: "یو یو آئی ڈی وی 4",
        uuidv6: "یو یو آئی ڈی وی 6",
        nanoid: "نینو آئی ڈی",
        guid: "جی یو آئی ڈی",
        cuid: "سی یو آئی ڈی",
        cuid2: "سی یو آئی ڈی 2",
        ulid: "یو ایل آئی ڈی",
        xid: "ایکس آئی ڈی",
        ksuid: "کے ایس یو آئی ڈی",
        datetime: "آئی ایس او ڈیٹ ٹائم",
        date: "آئی ایس او تاریخ",
        time: "آئی ایس او وقت",
        duration: "آئی ایس او مدت",
        ipv4: "آئی پی وی 4 ایڈریس",
        ipv6: "آئی پی وی 6 ایڈریس",
        cidrv4: "آئی پی وی 4 رینج",
        cidrv6: "آئی پی وی 6 رینج",
        base64: "بیس 64 ان کوڈڈ سٹرنگ",
        base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
        json_string: "جے ایس او این سٹرنگ",
        e164: "ای 164 نمبر",
        jwt: "جے ڈبلیو ٹی",
        template_literal: "ان پٹ",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `غلط ان پٹ: ${issue.expected} متوقع تھا، ${parsedType(issue.input)} موصول ہوا`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `غلط ان پٹ: ${util.stringifyPrimitive(issue.values[0])} متوقع تھا`;
                return `غلط آپشن: ${util.joinValues(issue.values, "|")} میں سے ایک متوقع تھا`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `بہت بڑا: ${issue.origin ?? "ویلیو"} کے ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عناصر"} ہونے متوقع تھے`;
                return `بہت بڑا: ${issue.origin ?? "ویلیو"} کا ${adj}${issue.maximum.toString()} ہونا متوقع تھا`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `بہت چھوٹا: ${issue.origin} کے ${adj}${issue.minimum.toString()} ${sizing.unit} ہونے متوقع تھے`;
                }
                return `بہت چھوٹا: ${issue.origin} کا ${adj}${issue.minimum.toString()} ہونا متوقع تھا`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `غلط سٹرنگ: "${_issue.prefix}" سے شروع ہونا چاہیے`;
                }
                if (_issue.format === "ends_with")
                    return `غلط سٹرنگ: "${_issue.suffix}" پر ختم ہونا چاہیے`;
                if (_issue.format === "includes")
                    return `غلط سٹرنگ: "${_issue.includes}" شامل ہونا چاہیے`;
                if (_issue.format === "regex")
                    return `غلط سٹرنگ: پیٹرن ${_issue.pattern} سے میچ ہونا چاہیے`;
                return `غلط ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `غلط نمبر: ${issue.divisor} کا مضاعف ہونا چاہیے`;
            case "unrecognized_keys":
                return `غیر تسلیم شدہ کی${issue.keys.length > 1 ? "ز" : ""}: ${util.joinValues(issue.keys, "، ")}`;
            case "invalid_key":
                return `${issue.origin} میں غلط کی`;
            case "invalid_union":
                return "غلط ان پٹ";
            case "invalid_element":
                return `${issue.origin} میں غلط ویلیو`;
            default:
                return `غلط ان پٹ`;
        }
    };
};
/* harmony default export */ function ur() {
    return {
        localeError: ur_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/vi.js

const vi_error = () => {
    const Sizable = {
        string: { unit: "ký tự", verb: "có" },
        file: { unit: "byte", verb: "có" },
        array: { unit: "phần tử", verb: "có" },
        set: { unit: "phần tử", verb: "có" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "số";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "mảng";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "đầu vào",
        email: "địa chỉ email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ngày giờ ISO",
        date: "ngày ISO",
        time: "giờ ISO",
        duration: "khoảng thời gian ISO",
        ipv4: "địa chỉ IPv4",
        ipv6: "địa chỉ IPv6",
        cidrv4: "dải IPv4",
        cidrv6: "dải IPv6",
        base64: "chuỗi mã hóa base64",
        base64url: "chuỗi mã hóa base64url",
        json_string: "chuỗi JSON",
        e164: "số E.164",
        jwt: "JWT",
        template_literal: "đầu vào",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `Đầu vào không hợp lệ: mong đợi ${issue.expected}, nhận được ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `Đầu vào không hợp lệ: mong đợi ${util.stringifyPrimitive(issue.values[0])}`;
                return `Tùy chọn không hợp lệ: mong đợi một trong các giá trị ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `Quá lớn: mong đợi ${issue.origin ?? "giá trị"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "phần tử"}`;
                return `Quá lớn: mong đợi ${issue.origin ?? "giá trị"} ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `Quá nhỏ: mong đợi ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `Quá nhỏ: mong đợi ${issue.origin} ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `Chuỗi không hợp lệ: phải bắt đầu bằng "${_issue.prefix}"`;
                if (_issue.format === "ends_with")
                    return `Chuỗi không hợp lệ: phải kết thúc bằng "${_issue.suffix}"`;
                if (_issue.format === "includes")
                    return `Chuỗi không hợp lệ: phải bao gồm "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `Chuỗi không hợp lệ: phải khớp với mẫu ${_issue.pattern}`;
                return `${Nouns[_issue.format] ?? issue.format} không hợp lệ`;
            }
            case "not_multiple_of":
                return `Số không hợp lệ: phải là bội số của ${issue.divisor}`;
            case "unrecognized_keys":
                return `Khóa không được nhận dạng: ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `Khóa không hợp lệ trong ${issue.origin}`;
            case "invalid_union":
                return "Đầu vào không hợp lệ";
            case "invalid_element":
                return `Giá trị không hợp lệ trong ${issue.origin}`;
            default:
                return `Đầu vào không hợp lệ`;
        }
    };
};
/* harmony default export */ function vi() {
    return {
        localeError: vi_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/zh-CN.js

const zh_CN_error = () => {
    const Sizable = {
        string: { unit: "字符", verb: "包含" },
        file: { unit: "字节", verb: "包含" },
        array: { unit: "项", verb: "包含" },
        set: { unit: "项", verb: "包含" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "非数字(NaN)" : "数字";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "数组";
                }
                if (data === null) {
                    return "空值(null)";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "输入",
        email: "电子邮件",
        url: "URL",
        emoji: "表情符号",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO日期时间",
        date: "ISO日期",
        time: "ISO时间",
        duration: "ISO时长",
        ipv4: "IPv4地址",
        ipv6: "IPv6地址",
        cidrv4: "IPv4网段",
        cidrv6: "IPv6网段",
        base64: "base64编码字符串",
        base64url: "base64url编码字符串",
        json_string: "JSON字符串",
        e164: "E.164号码",
        jwt: "JWT",
        template_literal: "输入",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `无效输入：期望 ${issue.expected}，实际接收 ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `无效输入：期望 ${util.stringifyPrimitive(issue.values[0])}`;
                return `无效选项：期望以下之一 ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `数值过大：期望 ${issue.origin ?? "值"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "个元素"}`;
                return `数值过大：期望 ${issue.origin ?? "值"} ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `数值过小：期望 ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `数值过小：期望 ${issue.origin} ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with")
                    return `无效字符串：必须以 "${_issue.prefix}" 开头`;
                if (_issue.format === "ends_with")
                    return `无效字符串：必须以 "${_issue.suffix}" 结尾`;
                if (_issue.format === "includes")
                    return `无效字符串：必须包含 "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `无效字符串：必须满足正则表达式 ${_issue.pattern}`;
                return `无效${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `无效数字：必须是 ${issue.divisor} 的倍数`;
            case "unrecognized_keys":
                return `出现未知的键(key): ${util.joinValues(issue.keys, ", ")}`;
            case "invalid_key":
                return `${issue.origin} 中的键(key)无效`;
            case "invalid_union":
                return "无效输入";
            case "invalid_element":
                return `${issue.origin} 中包含无效值(value)`;
            default:
                return `无效输入`;
        }
    };
};
/* harmony default export */ function zh_CN() {
    return {
        localeError: zh_CN_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/zh-TW.js

const zh_TW_error = () => {
    const Sizable = {
        string: { unit: "字元", verb: "擁有" },
        file: { unit: "位元組", verb: "擁有" },
        array: { unit: "項目", verb: "擁有" },
        set: { unit: "項目", verb: "擁有" },
    };
    function getSizing(origin) {
        return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
        const t = typeof data;
        switch (t) {
            case "number": {
                return Number.isNaN(data) ? "NaN" : "number";
            }
            case "object": {
                if (Array.isArray(data)) {
                    return "array";
                }
                if (data === null) {
                    return "null";
                }
                if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
                    return data.constructor.name;
                }
            }
        }
        return t;
    };
    const Nouns = {
        regex: "輸入",
        email: "郵件地址",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO 日期時間",
        date: "ISO 日期",
        time: "ISO 時間",
        duration: "ISO 期間",
        ipv4: "IPv4 位址",
        ipv6: "IPv6 位址",
        cidrv4: "IPv4 範圍",
        cidrv6: "IPv6 範圍",
        base64: "base64 編碼字串",
        base64url: "base64url 編碼字串",
        json_string: "JSON 字串",
        e164: "E.164 數值",
        jwt: "JWT",
        template_literal: "輸入",
    };
    return (issue) => {
        switch (issue.code) {
            case "invalid_type":
                return `無效的輸入值：預期為 ${issue.expected}，但收到 ${parsedType(issue.input)}`;
            case "invalid_value":
                if (issue.values.length === 1)
                    return `無效的輸入值：預期為 ${util.stringifyPrimitive(issue.values[0])}`;
                return `無效的選項：預期為以下其中之一 ${util.joinValues(issue.values, "|")}`;
            case "too_big": {
                const adj = issue.inclusive ? "<=" : "<";
                const sizing = getSizing(issue.origin);
                if (sizing)
                    return `數值過大：預期 ${issue.origin ?? "值"} 應為 ${adj}${issue.maximum.toString()} ${sizing.unit ?? "個元素"}`;
                return `數值過大：預期 ${issue.origin ?? "值"} 應為 ${adj}${issue.maximum.toString()}`;
            }
            case "too_small": {
                const adj = issue.inclusive ? ">=" : ">";
                const sizing = getSizing(issue.origin);
                if (sizing) {
                    return `數值過小：預期 ${issue.origin} 應為 ${adj}${issue.minimum.toString()} ${sizing.unit}`;
                }
                return `數值過小：預期 ${issue.origin} 應為 ${adj}${issue.minimum.toString()}`;
            }
            case "invalid_format": {
                const _issue = issue;
                if (_issue.format === "starts_with") {
                    return `無效的字串：必須以 "${_issue.prefix}" 開頭`;
                }
                if (_issue.format === "ends_with")
                    return `無效的字串：必須以 "${_issue.suffix}" 結尾`;
                if (_issue.format === "includes")
                    return `無效的字串：必須包含 "${_issue.includes}"`;
                if (_issue.format === "regex")
                    return `無效的字串：必須符合格式 ${_issue.pattern}`;
                return `無效的 ${Nouns[_issue.format] ?? issue.format}`;
            }
            case "not_multiple_of":
                return `無效的數字：必須為 ${issue.divisor} 的倍數`;
            case "unrecognized_keys":
                return `無法識別的鍵值${issue.keys.length > 1 ? "們" : ""}：${util.joinValues(issue.keys, "、")}`;
            case "invalid_key":
                return `${issue.origin} 中有無效的鍵值`;
            case "invalid_union":
                return "無效的輸入值";
            case "invalid_element":
                return `${issue.origin} 中有無效的值`;
            default:
                return `無效的輸入值`;
        }
    };
};
/* harmony default export */ function zh_TW() {
    return {
        localeError: zh_TW_error(),
    };
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/locales/index.js








































// EXTERNAL MODULE: ./node_modules/zod/v4/core/registries.js
var registries = __webpack_require__(9396);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/doc.js
var doc = __webpack_require__(2041);
// EXTERNAL MODULE: ./node_modules/zod/v4/core/api.js
var api = __webpack_require__(3759);
;// CONCATENATED MODULE: ./node_modules/zod/v4/core/function.js




class $ZodFunction {
    constructor(def) {
        this._def = def;
        this.def = def;
    }
    implement(func) {
        if (typeof func !== "function") {
            throw new Error("implement() must be called with a function");
        }
        const impl = ((...args) => {
            const parsedArgs = this._def.input ? (0,parse/* parse */.qg)(this._def.input, args, undefined, { callee: impl }) : args;
            if (!Array.isArray(parsedArgs)) {
                throw new Error("Invalid arguments schema: not an array or tuple schema.");
            }
            const output = func(...parsedArgs);
            return this._def.output ? (0,parse/* parse */.qg)(this._def.output, output, undefined, { callee: impl }) : output;
        });
        return impl;
    }
    implementAsync(func) {
        if (typeof func !== "function") {
            throw new Error("implement() must be called with a function");
        }
        const impl = (async (...args) => {
            const parsedArgs = this._def.input ? await (0,parse/* parseAsync */.EJ)(this._def.input, args, undefined, { callee: impl }) : args;
            if (!Array.isArray(parsedArgs)) {
                throw new Error("Invalid arguments schema: not an array or tuple schema.");
            }
            const output = await func(...parsedArgs);
            return this._def.output ? (0,parse/* parseAsync */.EJ)(this._def.output, output, undefined, { callee: impl }) : output;
        });
        return impl;
    }
    input(...args) {
        const F = this.constructor;
        if (Array.isArray(args[0])) {
            return new F({
                type: "function",
                input: new schemas/* $ZodTuple */.G3({
                    type: "tuple",
                    items: args[0],
                    rest: args[1],
                }),
                output: this._def.output,
            });
        }
        return new F({
            type: "function",
            input: args[0],
            output: this._def.output,
        });
    }
    output(output) {
        const F = this.constructor;
        return new F({
            type: "function",
            input: this._def.input,
            output,
        });
    }
}
function _function(params) {
    return new $ZodFunction({
        type: "function",
        input: Array.isArray(params?.input)
            ? (0,api/* _tuple */.gt)(schemas/* $ZodTuple */.G3, params?.input)
            : (params?.input ?? (0,api/* _array */.dZ)(schemas/* $ZodArray */.$p, (0,api/* _unknown */.em)(schemas/* $ZodUnknown */.GP))),
        output: params?.output ?? (0,api/* _unknown */.em)(schemas/* $ZodUnknown */.GP),
    });
}


// EXTERNAL MODULE: ./node_modules/zod/v4/core/to-json-schema.js
var to_json_schema = __webpack_require__(7509);
;// CONCATENATED MODULE: ./node_modules/zod/v4/core/json-schema.js


;// CONCATENATED MODULE: ./node_modules/zod/v4/core/index.js
















// EXTERNAL MODULE: ./node_modules/zod/v4/classic/schemas.js
var classic_schemas = __webpack_require__(5156);
;// CONCATENATED MODULE: ./node_modules/zod/v4/classic/checks.js


// EXTERNAL MODULE: ./node_modules/zod/v4/classic/errors.js
var classic_errors = __webpack_require__(961);
// EXTERNAL MODULE: ./node_modules/zod/v4/classic/parse.js
var classic_parse = __webpack_require__(9171);
;// CONCATENATED MODULE: ./node_modules/zod/v4/classic/compat.js
// Zod 3 compat layer

/** @deprecated Use the raw string literal codes instead, e.g. "invalid_type". */
const ZodIssueCode = {
    invalid_type: "invalid_type",
    too_big: "too_big",
    too_small: "too_small",
    invalid_format: "invalid_format",
    not_multiple_of: "not_multiple_of",
    unrecognized_keys: "unrecognized_keys",
    invalid_union: "invalid_union",
    invalid_key: "invalid_key",
    invalid_element: "invalid_element",
    invalid_value: "invalid_value",
    custom: "custom",
};

/** @deprecated Use `z.config(params)` instead. */
function setErrorMap(map) {
    core/* config */.$W({
        customError: map,
    });
}
/** @deprecated Use `z.config()` instead. */
function getErrorMap() {
    return core/* config */.$W().customError;
}

// EXTERNAL MODULE: ./node_modules/zod/v4/classic/iso.js
var iso = __webpack_require__(4377);
;// CONCATENATED MODULE: ./node_modules/zod/v4/classic/coerce.js


function string(params) {
    return api/* _coercedString */.K_(classic_schemas/* ZodString */.ND, params);
}
function number(params) {
    return api/* _coercedNumber */.qG(classic_schemas/* ZodNumber */.rS, params);
}
function coerce_boolean(params) {
    return api/* _coercedBoolean */.dN(classic_schemas/* ZodBoolean */.WF, params);
}
function bigint(params) {
    return api/* _coercedBigint */.St(classic_schemas/* ZodBigInt */.Lr, params);
}
function date(params) {
    return api/* _coercedDate */.B4(classic_schemas/* ZodDate */.aP, params);
}

;// CONCATENATED MODULE: ./node_modules/zod/v4/classic/external.js






// zod-specified


(0,core/* config */.$W)(en());


// iso
// must be exported from top-level
// https://github.com/colinhacks/zod/issues/4491




;// CONCATENATED MODULE: ./node_modules/zod/v4/classic/index.js



/* harmony default export */ const classic = ((/* unused pure expression or super */ null && (z)));

;// CONCATENATED MODULE: ./node_modules/zod/v4/index.js


/* harmony default export */ const v4 = ((/* unused pure expression or super */ null && (z4)));


/***/ })

};
