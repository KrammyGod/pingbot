// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylisticJs from '@stylistic/eslint-plugin';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        'plugins': {
            '@stylistic/js': stylisticJs,
        },
        'rules': {
            '@stylistic/js/indent': [
                'error',
                4,
                {
                    'SwitchCase': 1,
                },
            ],
            '@stylistic/js/quotes': [
                'error',
                'single',
                {
                    'avoidEscape': true,
                },
            ],
            '@stylistic/js/semi': [
                'error',
                'always',
            ],
            '@stylistic/js/max-len': [
                'warn',
                {
                    'code': 120,
                    'ignoreUrls': true,
                },
            ],
            '@stylistic/js/comma-dangle': [
                'error',
                {
                    'arrays': 'always-multiline',
                    'objects': 'always-multiline',
                    'imports': 'always',
                    'exports': 'always-multiline',
                    'functions': 'always-multiline',
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'caughtErrors': 'none',
                },
            ],
        },
    },
);
