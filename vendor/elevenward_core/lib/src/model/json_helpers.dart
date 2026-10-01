T enumByName<T extends Enum>(List<T> values, Object? value, String field) {
  if (value is! String) {
    throw FormatException('$field must be a string.');
  }
  for (final candidate in values) {
    if (candidate.name == value) {
      return candidate;
    }
  }
  throw FormatException('Unknown $field value: $value.');
}

Map<String, Object?> jsonObject(Object? value, String field) {
  if (value is! Map<String, Object?>) {
    throw FormatException('$field must be a JSON object.');
  }
  return value;
}

String jsonString(Map<String, Object?> json, String field) {
  final value = json[field];
  if (value is! String) {
    throw FormatException('$field must be a string.');
  }
  return value;
}

int jsonInt(Map<String, Object?> json, String field) {
  final value = json[field];
  if (value is! int) {
    throw FormatException('$field must be an integer.');
  }
  return value;
}

double jsonDouble(Map<String, Object?> json, String field) {
  final value = json[field];
  if (value is! num) {
    throw FormatException('$field must be a number.');
  }
  return value.toDouble();
}

bool jsonBool(Map<String, Object?> json, String field) {
  final value = json[field];
  if (value is! bool) {
    throw FormatException('$field must be a boolean.');
  }
  return value;
}

double clampRating(double value) => value.clamp(0, 100).toDouble();

double roundTo(double value, int places) {
  final factor = switch (places) {
    0 => 1,
    1 => 10,
    2 => 100,
    3 => 1000,
    4 => 10000,
    _ => throw ArgumentError.value(places, 'places', 'Must be 0 to 4.'),
  };
  return (value * factor).round() / factor;
}
