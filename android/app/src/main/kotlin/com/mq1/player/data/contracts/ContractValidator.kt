package com.mq1.player.data.contracts

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Kotlin twin of `src/lib/contracts/validate.ts`. Interprets the shared contract
 * format in `shared/contracts/` (e.g. track.contract.json) and must produce the
 * same `<field>:<rule>` codes as the web validator for every case in
 * `shared/test-fixtures/` — both test suites run the same fixtures.
 */
class ContractValidator(contract: JsonObject) {

    data class Result(val errors: List<String>, val warnings: List<String>) {
        val valid: Boolean get() = errors.isEmpty()
    }

    private data class Field(
        val name: String,
        val type: String,
        val required: Boolean,
        val nullable: Boolean,
        val enumValues: List<JsonPrimitive>?,
        val minLength: Int?,
        val min: Double?,
        val max: Double?,
    )

    private data class IdRule(val source: String, val pattern: Regex, val isError: Boolean)

    val name: String = contract.getValue("contract").jsonPrimitive.content
    val version: Int = contract.getValue("version").jsonPrimitive.content.toInt()
    private val forbidExtra = contract["additionalFields"]?.jsonPrimitive?.contentOrNull == "forbid"

    private val fields: List<Field> = contract.getValue("fields").jsonObject.map { (n, raw) ->
        val o = raw.jsonObject
        Field(
            name = n,
            type = o.getValue("type").jsonPrimitive.content,
            required = o["required"]?.jsonPrimitive?.booleanOrNull == true,
            nullable = o["nullable"]?.jsonPrimitive?.booleanOrNull == true,
            enumValues = o["enum"]?.jsonArray?.map { it.jsonPrimitive },
            minLength = o["minLength"]?.jsonPrimitive?.content?.toInt(),
            min = o["min"]?.jsonPrimitive?.doubleOrNull,
            max = o["max"]?.jsonPrimitive?.doubleOrNull,
        )
    }

    val fieldNames: Set<String> = fields.map { it.name }.toSet()

    private val idRules: List<IdRule> = (contract["idRules"] as? JsonArray).orEmpty().map {
        val o = it.jsonObject
        IdRule(
            source = o.getValue("source").jsonPrimitive.content,
            pattern = Regex(o.getValue("pattern").jsonPrimitive.content),
            isError = o["severity"]?.jsonPrimitive?.contentOrNull == "error",
        )
    }

    fun validate(payload: JsonElement?): Result {
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        if (payload !is JsonObject) return Result(listOf("\$:type"), warnings)

        for (f in fields) {
            val v = payload[f.name]
            if (v == null) {
                if (f.required) errors += "${f.name}:required"
                continue
            }
            if (v is JsonNull) {
                if (!f.nullable) errors += "${f.name}:type"
                continue
            }
            if (!typeMatches(f.type, v)) {
                errors += "${f.name}:type"
                continue
            }
            if (v is JsonPrimitive) {
                if (f.enumValues != null && f.enumValues.none { sameValue(it, v) }) errors += "${f.name}:enum"
                if (f.minLength != null && v.isString && v.content.length < f.minLength) errors += "${f.name}:minLength"
                if (!v.isString) {
                    val d = v.doubleOrNull
                    if (d != null && f.min != null && d < f.min) errors += "${f.name}:min"
                    if (d != null && f.max != null && d > f.max) errors += "${f.name}:max"
                }
            }
        }
        if (forbidExtra) {
            for (k in payload.keys) if (k !in fieldNames) errors += "$k:unknown"
        }
        val idOk = errors.none { it.startsWith("id:") || it.startsWith("source:") }
        val id = (payload["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val source = (payload["source"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (idOk && id != null && source != null) {
            for (r in idRules) {
                if (r.source != source) continue
                if (!r.pattern.containsMatchIn(id)) (if (r.isError) errors else warnings) += "id:pattern"
            }
        }
        return Result(errors, warnings)
    }

    private fun typeMatches(type: String, v: JsonElement): Boolean = when (type) {
        "string" -> v is JsonPrimitive && v.isString
        "boolean" -> v is JsonPrimitive && !v.isString && v.booleanOrNull != null
        "number" -> v is JsonPrimitive && !v.isString && v.booleanOrNull == null && v.doubleOrNull?.isFinite() == true
        "integer" -> v is JsonPrimitive && !v.isString && v.booleanOrNull == null &&
            v.doubleOrNull?.let { it.isFinite() && it == Math.floor(it) } == true
        "object" -> v is JsonObject
        "array" -> v is JsonArray
        else -> false
    }

    private fun sameValue(a: JsonPrimitive, b: JsonPrimitive): Boolean =
        if (a.isString || b.isString) a.isString == b.isString && a.content == b.content
        else a.doubleOrNull == b.doubleOrNull

    companion object {
        fun fromJson(text: String): ContractValidator =
            ContractValidator(Json.parseToJsonElement(text).jsonObject)
    }
}
