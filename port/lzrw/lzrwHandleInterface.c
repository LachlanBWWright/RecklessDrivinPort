/*
 * lzrwHandleInterface.c
 *
 * Mac Handle interface for LZRW3-A decompression.
 *
 * Based on Nathan Craddock's open-reckless-drivin port analysis:
 * https://nathancraddock.com/blog/resource-forks-and-lzrw-compression/
 *
 * The packs in Reckless Drivin' are LZRW3-A compressed. The format is:
 *   - 4 bytes: uncompressed size (big-endian uint32)
 *   - remaining bytes: LZRW3-A compressed data
 */

#include "lzrwHandleInterface.h"
#include "lzrw/lzrw.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* Swap bytes for big-endian to host conversion */
static uint32_t be32_to_host(uint32_t val) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
    return ((val & 0xFF000000u) >> 24) |
           ((val & 0x00FF0000u) >> 8)  |
           ((val & 0x0000FF00u) << 8)  |
           ((val & 0x000000FFu) << 24);
#else
    return val;
#endif
}

void LZRWDecodeHandle(Handle *handle)
{
    if (!handle || !*handle || !**handle) {
        fprintf(stderr, "LZRWDecodeHandle: invalid handle\n");
        return;
    }

    uint8_t *data = (uint8_t *)*handle;

    /* Get the working memory size required by lzrw3a */
    struct compress_identity id = lzrw_identity();
    uint8_t *wrk_mem = (uint8_t *)malloc(id.memory);
    if (!wrk_mem) {
        fprintf(stderr, "LZRWDecodeHandle: out of memory for working buffer\n");
        return;
    }

    /* The first 4 bytes are the uncompressed size (big-endian) */
    uint32_t uncompressed_size;
    memcpy(&uncompressed_size, data, 4);
    uncompressed_size = be32_to_host(uncompressed_size);

    /* The compressed data starts at offset 4 */
    const uint8_t *compressed_data = data + 4;

    /* We need to know the compressed data length. Use GetHandleSize. */
    extern Size GetHandleSize(Handle h);
    Size handle_size = GetHandleSize(handle);
    if (handle_size <= 4) {
        free(wrk_mem);
        return;
    }
    uint32_t compressed_len = (uint32_t)(handle_size - 4);

    /* Allocate output buffer */
    uint8_t *dst_buf = (uint8_t *)malloc(uncompressed_size + COMPRESS_OVERRUN);
    if (!dst_buf) {
        fprintf(stderr, "LZRWDecodeHandle: out of memory for output buffer\n");
        free(wrk_mem);
        return;
    }

    uint64_t dst_len = 0;
    lzrw3a_compress(COMPRESS_ACTION_DECOMPRESS, wrk_mem,
                     compressed_data, compressed_len,
                     dst_buf, &dst_len);

    free(wrk_mem);

    if (dst_len != uncompressed_size) {
        fprintf(stderr, "LZRWDecodeHandle: size mismatch: got %llu, expected %u\n",
                (unsigned long long)dst_len, uncompressed_size);
    }

    /* Replace handle contents with decompressed data */
    free(*handle);
    *handle = (char **)malloc(sizeof(char *));
    if (!*handle) {
        free(dst_buf);
        return;
    }
    **handle = (char *)dst_buf;
}
