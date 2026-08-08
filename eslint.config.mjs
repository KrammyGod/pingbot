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
            'no-useless-assignment': 'off',
            'preserve-caught-error': 'off',
            '@stylistic/js/indent': [
                'error',
                4,
                {
                    'MemberExpression': 'off',
                    'SwitchCase': 0,
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
                'always-multiline',
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
