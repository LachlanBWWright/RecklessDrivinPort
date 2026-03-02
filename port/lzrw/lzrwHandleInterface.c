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

/* Mac Handle API - use mac_compat for proper Handle management */
#include "mac_compat.h"

/* Swap bytes: big-endian to host conversion */
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
    uint8_t *data;
    uint32_t uncompressed_size, compressed_len;
    Size handle_size;
    struct compress_identity id;
    uint8_t *wrk_mem, *dst_buf;
    uint64_t dst_len = 0;

    if (!handle || !*handle || !**handle) {
        fprintf(stderr, "LZRWDecodeHandle: invalid handle\n");
        return;
    }

    data = (uint8_t *)(**handle);
    handle_size = GetHandleSize(*handle);

    if (handle_size < 4) {
        fprintf(stderr, "LZRWDecodeHandle: handle too small (%d bytes)\n", (int)handle_size);
        return;
    }

    /* The first 4 bytes are the uncompressed size (big-endian) */
    memcpy(&uncompressed_size, data, 4);
    uncompressed_size = be32_to_host(uncompressed_size);

    if (uncompressed_size == 0 || uncompressed_size > 32 * 1024 * 1024) {
        fprintf(stderr, "LZRWDecodeHandle: suspicious uncompressed size %u\n", uncompressed_size);
        return;
    }

    compressed_len = (uint32_t)(handle_size - 4);

    /* Get working memory size for lzrw3a */
    id = lzrw_identity();
    wrk_mem = (uint8_t *)malloc(id.memory);
    if (!wrk_mem) {
        fprintf(stderr, "LZRWDecodeHandle: out of memory for working buffer\n");
        return;
    }

    /* Allocate output buffer */
    dst_buf = (uint8_t *)malloc((size_t)uncompressed_size + COMPRESS_OVERRUN);
    if (!dst_buf) {
        fprintf(stderr, "LZRWDecodeHandle: out of memory for output buffer\n");
        free(wrk_mem);
        return;
    }

    /* Decompress */
    lzrw3a_compress(COMPRESS_ACTION_DECOMPRESS, wrk_mem,
                     data + 4, compressed_len,
                     dst_buf, &dst_len);
    free(wrk_mem);

    if ((uint32_t)dst_len != uncompressed_size) {
        fprintf(stderr, "LZRWDecodeHandle: size mismatch: got %llu, expected %u\n",
                (unsigned long long)dst_len, uncompressed_size);
        /* Use actual decompressed size to be safe */
        uncompressed_size = (uint32_t)dst_len;
    }

    /*
     * Replace handle contents with the decompressed data.
     * Use SetHandleSize + memcpy to work correctly with our size-prefixed
     * Handle implementation (avoids calling free() on the data pointer directly).
     */
    SetHandleSize(*handle, (Size)uncompressed_size);
    memcpy(**handle, dst_buf, (size_t)dst_len);
    free(dst_buf);
}
