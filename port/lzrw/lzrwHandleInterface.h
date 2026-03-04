/* lzrwHandleInterface.h
 *
 * Mac Handle interface for the LZRW3-A compression/decompression library.
 * Used by packs.c, interface.c, and gameendseq.c to decompress resource data.
 *
 * The original game stored compressed resources using LZRW compression.
 * This interface wraps the lzrw3a_compress function to work with Mac Handles.
 *
 * See: Nathan Craddock's analysis at https://nathancraddock.com/blog/resource-forks-and-lzrw-compression/
 */

#ifndef LZRW_HANDLE_INTERFACE_H
#define LZRW_HANDLE_INTERFACE_H

#include "mac_compat.h"

/*
 * LZRWDecodeHandle - Decompress an LZRW-compressed Handle in place.
 *
 * The Handle is expected to start with a 4-byte uncompressed size field,
 * followed by the compressed data. The handle is reallocated to hold
 * the decompressed data.
 */
void LZRWDecodeHandle(Handle *handle);

#endif /* LZRW_HANDLE_INTERFACE_H */
