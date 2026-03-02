/******************************************************************************/
/*                                                                            */
/*                                 LZRW.H                                    */
/*                                                                            */
/******************************************************************************/
/*
 * Author : Ross Williams.
 * Date   : December 1989.
 *
 * LZRW3-A compression algorithm header.
 * Taken from Nathan Craddock's open-reckless-drivin port
 * (https://github.com/natecraddock/open-reckless-drivin)
 * which sourced it from Ross Williams' original public domain code.
 */

#ifndef LZRW_H
#define LZRW_H

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#define COMPRESS_ACTION_IDENTITY   0
#define COMPRESS_ACTION_COMPRESS   1
#define COMPRESS_ACTION_DECOMPRESS 2

#define COMPRESS_OVERRUN    1024
#define COMPRESS_MAX_COM    0x70000000
#define COMPRESS_MAX_ORG    (COMPRESS_MAX_COM - COMPRESS_OVERRUN)
#define COMPRESS_MAX_STRLEN 255

struct compress_identity {
    uint32_t id;
    uint32_t memory;
    char *name;
    char *version;
    char *date;
    char *copyright;
    char *author;
    char *affiliation;
    char *vendor;
};

struct compress_identity lzrw_identity(void);

void lzrw3a_compress(
    uint16_t  action,
    uint8_t  *wrk_mem,
    const uint8_t *src_adr,
    uint32_t  src_len,
    uint8_t  *dst_adr,
    uint64_t *p_dst_len
);

#endif /* LZRW_H */
