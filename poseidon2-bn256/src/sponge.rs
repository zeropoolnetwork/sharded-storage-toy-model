// This file was obtained from Noir using Claude.ai plus some manual changes:
//    https://github.com/noir-lang/noir/blob/55d8e05b84ae23a1a218e7027542af175979885c/noir_stdlib/src/hash/poseidon2.nr
//
// It implements sponge and hash using poseidon2 permutation provided by zkhash.

use std::sync::Arc;
use zkhash::poseidon2::{
    poseidon2::Poseidon2,
    poseidon2_params::Poseidon2Params,
  };
use ark_ff::PrimeField;

const RATE: usize = 3;

pub struct Poseidon2Hash<F: PrimeField> {
    cache: [F; RATE],
    state: [F; RATE + 1],
    cache_size: usize,
    squeeze_mode: bool,
    poseidon2: Poseidon2<F>,
}

impl<F: PrimeField> Poseidon2Hash<F> {
    fn new(iv: F, params: &Arc<Poseidon2Params<F>>) -> Self {
        let mut result = Poseidon2Hash {
            cache: [F::zero(); RATE],
            state: [F::zero(); RATE + 1],
            cache_size: 0,
            squeeze_mode: false,
            poseidon2: Poseidon2::new(params),
        };
        result.state[RATE] = iv;
        result
    }

    fn perform_duplex(&mut self) -> [F; RATE] {
        // Zero-pad the cache
        for i in self.cache_size..RATE {
            self.cache[i] = F::zero();
        }
        // Add the cache into sponge state
        for i in 0..RATE {
            self.state[i] += self.cache[i];
        }
        {
          let new_state = self.poseidon2.permutation(self.state.as_slice());
          self.state.copy_from_slice(new_state.as_slice());
        }
        // Return `RATE` number of field elements from the sponge state.
        let mut result = [F::zero(); RATE];
        result.copy_from_slice(&self.state[..RATE]);
        result
    }

    fn absorb(&mut self, input: F) {
        if !self.squeeze_mode && self.cache_size == RATE {
            // If we're absorbing and the cache is full, apply the sponge permutation to compress the cache
            let _ = self.perform_duplex();
            self.cache[0] = input;
            self.cache_size = 1;
        } else if !self.squeeze_mode && self.cache_size != RATE {
            // If we're absorbing and the cache is not full, add the input into the cache
            self.cache[self.cache_size] = input;
            self.cache_size += 1;
        } else if self.squeeze_mode {
            // If we're in squeeze mode, switch to absorb mode and add the input into the cache.
            // N.B. I don't think this code path can be reached?!
            self.cache[0] = input;
            self.cache_size = 1;
            self.squeeze_mode = false;
        }
    }

    fn squeeze(&mut self) -> F {
        if self.squeeze_mode && self.cache_size == 0 {
            // If we're in squeeze mode and the cache is empty, there is nothing left to squeeze out of the sponge!
            // Switch to absorb mode.
            self.squeeze_mode = false;
            self.cache_size = 0;
        }
        if !self.squeeze_mode {
            // If we're in absorb mode, apply sponge permutation to compress the cache, populate cache with compressed
            // state and switch to squeeze mode. Note: this code block will execute if the previous `if` condition was
            // matched.
            let new_output_elements = self.perform_duplex();
            self.squeeze_mode = true;
            self.cache.copy_from_slice(&new_output_elements);
            self.cache_size = RATE;
        }
        // By this point, we should have a non-empty cache. Pop one item off the top of the cache and return it.
        let result = self.cache[0];
        self.cache.copy_within(1..self.cache_size, 0);
        self.cache_size -= 1;
        self.cache[self.cache_size] = F::zero();
        result
    }

    pub fn hash(
      params: &Arc<Poseidon2Params<F>>,
      input: &[F],
      is_variable_length: bool,
    ) -> F {
        let iv = F::from(input.len() as u64) * F::from(1u128 << 64);
        let mut sponge = Self::new(iv, params);
        for &element in input.iter().take(input.len()) {
            sponge.absorb(element);
        }

        // In the case where the hash preimage is variable-length, we append `1` to the end of the input, to distinguish
        // from fixed-length hashes. (the combination of this additional field element + the hash IV ensures
        // fixed-length and variable-length hashes do not collide)
        if is_variable_length {
            sponge.absorb(F::one());
        }
        sponge.squeeze()
    }

    // pub fn hash<const N: usize>(params: &Arc<Poseidon2Params<F>>, input: [F; N], message_size: usize) -> F {
    //     if message_size == N {
    //         Self::hash_internal(params, input, N, false)
    //     } else {
    //         Self::hash_internal(params, input, message_size, true)
    //     }
    // }
}
