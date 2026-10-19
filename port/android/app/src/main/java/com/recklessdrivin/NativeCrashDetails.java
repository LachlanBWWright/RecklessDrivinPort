package com.recklessdrivin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Reads the public Android debuggerd tombstone schema, ignoring unrelated fields. */
final class NativeCrashDetails {
    private NativeCrashDetails() {}

    static String describe(byte[] bytes) throws IOException {
        List<Field> tombstone = read(bytes);
        StringBuilder report = new StringBuilder();
        for (Field signal : fields(tombstone, 10)) {
            List<Field> info = read(signal.bytes);
            report.append("Signal: ").append(string(info, 2)).append(" (")
                    .append(string(info, 4)).append(")\n");
            if (number(info, 8) != 0)
                report.append("Fault address: 0x").append(Long.toHexString(number(info, 9))).append('\n');
        }
        String abort = string(tombstone, 14);
        if (!abort.isEmpty()) report.append("Abort: ").append(abort).append('\n');
        for (Field cause : fields(tombstone, 15)) {
            report.append("Cause: ").append(string(read(cause.bytes), 1)).append('\n');
        }
        long crashedThread = number(tombstone, 6);
        for (Field entry : fields(tombstone, 16)) {
            List<Field> map = read(entry.bytes);
            if (number(map, 1) != crashedThread) continue;
            for (Field value : fields(map, 2)) {
                List<Field> thread = read(value.bytes);
                report.append("\nThread: ").append(string(thread, 2)).append('\n');
                int index = 0;
                for (Field frame : fields(thread, 4)) {
                    if (index >= 24) break;
                    List<Field> info = read(frame.bytes);
                    report.append('#').append(index++).append(" pc ")
                            .append(Long.toHexString(number(info, 1))).append(' ')
                            .append(string(info, 6)).append(' ')
                            .append(string(info, 4)).append('+').append(number(info, 5)).append('\n');
                }
            }
        }
        return report.toString();
    }

    private static final class Field {
        int id;
        long value;
        byte[] bytes = new byte[0];
    }

    private static List<Field> read(byte[] bytes) throws IOException {
        List<Field> fields = new ArrayList<>();
        Cursor cursor = new Cursor(bytes);
        while (cursor.position < bytes.length) {
            long tag = cursor.varint();
            Field field = new Field();
            field.id = (int)(tag >>> 3);
            if (field.id == 0) throw new IOException("Invalid tombstone field");
            switch ((int)(tag & 7)) {
                case 0: field.value = cursor.varint(); break;
                case 1: cursor.skip(8); break;
                case 2:
                    long length = cursor.varint();
                    if (length < 0 || length > bytes.length - cursor.position)
                        throw new IOException("Invalid tombstone length");
                    field.bytes = java.util.Arrays.copyOfRange(bytes, cursor.position, cursor.position + (int)length);
                    cursor.skip((int)length);
                    break;
                case 5: cursor.skip(4); break;
                default: throw new IOException("Unsupported tombstone wire type");
            }
            fields.add(field);
            if (fields.size() > 100000) throw new IOException("Tombstone contains too many fields");
        }
        return fields;
    }

    private static List<Field> fields(List<Field> values, int id) {
        List<Field> matches = new ArrayList<>();
        for (Field field : values) if (field.id == id) matches.add(field);
        return matches;
    }

    private static long number(List<Field> values, int id) {
        for (Field field : values) if (field.id == id) return field.value;
        return 0;
    }

    private static String string(List<Field> values, int id) {
        for (Field field : values)
            if (field.id == id) return new String(field.bytes, StandardCharsets.UTF_8);
        return "";
    }

    private static final class Cursor {
        final byte[] bytes;
        int position;
        Cursor(byte[] bytes) { this.bytes = bytes; }
        long varint() throws IOException {
            long value = 0;
            for (int shift = 0; shift < 64; shift += 7) {
                if (position >= bytes.length) throw new IOException("Truncated tombstone");
                int next = bytes[position++] & 255;
                value |= (long)(next & 127) << shift;
                if ((next & 128) == 0) return value;
            }
            throw new IOException("Invalid tombstone number");
        }
        void skip(int count) throws IOException {
            if (count < 0 || count > bytes.length - position) throw new IOException("Truncated tombstone");
            position += count;
        }
    }
}
