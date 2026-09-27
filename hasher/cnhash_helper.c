/* Tiny CLI: cn_fast_hash of hex-encoded bytes from argv[1], prints hex. Uses the node's OWN hash.c/keccak.c (crypto-src/). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
extern void cn_fast_hash(const void *data, size_t length, char *hash);

static int hexval(char c) { return (c>='0'&&c<='9') ? c-'0' : (c>='a'&&c<='f') ? c-'a'+10 : (c>='A'&&c<='F') ? c-'A'+10 : -1; }

int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "usage: %s <hex bytes>\n", argv[0]); return 1; }
    size_t n = strlen(argv[1]) / 2;
    unsigned char *buf = malloc(n);
    for (size_t i = 0; i < n; i++) buf[i] = (unsigned char)(hexval(argv[1][2*i]) * 16 + hexval(argv[1][2*i+1]));
    unsigned char out[32];
    cn_fast_hash(buf, n, (char*)out);
    for (int i = 0; i < 32; i++) printf("%02x", out[i]);
    printf("\n");
    return 0;
}
