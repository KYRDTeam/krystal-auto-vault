pub mod token;

use solana_security_txt::security_txt;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Krystal Auto Vault",
    project_url: "https://krystal.app",
    contacts: "email:support@krystal.app,link:https://linktr.ee/krystal_defi",
    policy: "https://github.com/KYRDTeam/krystal-auto-vault/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/KYRDTeam/krystal-auto-vault"
}

declare_id!("6tgjvHkFUUUbbacEWg225H6AazxoSTso8ix9vkXFScTU");

pub const PDA_VAULT_SEED: &[u8] = b"userVault";
pub const PDA_GLOBAL_STATE_SEED: &[u8] = b"globalState";
pub const DISCRIMINATOR_SIZE: usize = 8;

#[program]
pub mod krystal_auto_vault {
    use super::*;

    pub fn initialize_user_pda(ctx: Context<CreateUserPDA>) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        user_vault.owner = ctx.accounts.owner.key();
        user_vault.bump = ctx.bumps.user_vault;
        Ok(())
    }

    pub fn close_user_pda(_ctx: Context<CloseUserVault>) -> Result<()> {
        Ok(())
    }

    pub fn initialize_global_state(ctx: Context<InitializeGlobalState>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let admin = ctx.accounts.admin.key();
        global_state.admin = admin;
        global_state.bump = ctx.bumps.global_state;
        global_state.operators.push(admin);
        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.admin = ctx.accounts.new_admin.key();
        Ok(())
    }

    pub fn update_operator(ctx: Context<UpdateOperator>, add: bool) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let operator = ctx.accounts.operator.key();
        if add {
            global_state.operators.push(operator);
        } else {
            global_state.operators.retain(|&x| x != operator);
        }
        Ok(())
    }

    pub fn transfer_lamports(ctx: Context<TransferLamports>, amount: u64) -> Result<()> {
        ctx.accounts.user_vault.sub_lamports(amount)?;
        ctx.accounts.to.add_lamports(amount)?;
        Ok(())
    }

    pub fn transfer_by_operator(ctx: Context<TransferByOperator>, amount: u64) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::transfer(
            &mut ctx.accounts.from_token_account,
            &mut ctx.accounts.to_token_account,
            &ctx.accounts.user_vault.to_account_info(),
            &ctx.accounts.mint,
            ctx.accounts.token_program.clone(),
            signer_seeds,
            amount,
        )
    }

    pub fn withdraw_token_by_operator(ctx: Context<TransferByOperator>) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        let amount = ctx.accounts.from_token_account.amount;

        token::transfer(
            &mut ctx.accounts.from_token_account,
            &mut ctx.accounts.to_token_account,
            &ctx.accounts.user_vault.to_account_info(),
            &ctx.accounts.mint,
            ctx.accounts.token_program.clone(),
            signer_seeds,
            amount,
        )
    }

    pub fn close_account_by_operator(ctx: Context<CloseTokenAccountByOperator>) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::close_token_account(
            &ctx.accounts.token_account,
            &ctx.accounts.destination,
            &ctx.accounts.user_vault.to_account_info(),
            ctx.accounts.token_program.clone(),
            signer_seeds,
        )
    }

    pub fn transfer_token(ctx: Context<TransferToken>, amount: u64) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::transfer(
            &ctx.accounts.from_token_account,
            &ctx.accounts.to_token_account,
            &ctx.accounts.user_vault.to_account_info(),
            &ctx.accounts.mint,
            ctx.accounts.token_program.clone(),
            signer_seeds,
            amount,
        )
    }

    pub fn withdraw_token(ctx: Context<TransferToken>) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        let amount = ctx.accounts.from_token_account.amount;

        token::transfer(
            &ctx.accounts.from_token_account,
            &ctx.accounts.to_token_account,
            &ctx.accounts.user_vault.to_account_info(),
            &ctx.accounts.mint,
            ctx.accounts.token_program.clone(),
            signer_seeds,
            amount,
        )
    }

    pub fn close_token_account(ctx: Context<CloseTokenAccount>) -> Result<()> {
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::close_token_account(
            &ctx.accounts.token_account,
            &ctx.accounts.destination,
            &ctx.accounts.user_vault.to_account_info(),
            ctx.accounts.token_program.clone(),
            signer_seeds,
        )
    }

    pub fn approve_token(ctx: Context<ApproveToken>, amount: u64) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::approve_token(
            &ctx.accounts.token_account,
            &ctx.accounts.delegate,
            &ctx.accounts.user_vault.to_account_info(),
            ctx.accounts.token_program.clone(),
            signer_seeds,
            amount,
        )
    }

    pub fn revoke_approval(ctx: Context<RevokeApproval>) -> Result<()> {
        // PDA signer seeds
        let user = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[PDA_VAULT_SEED, user.as_ref(), &[ctx.accounts.user_vault.bump]]];

        token::revoke_approval(
            &ctx.accounts.token_account,
            &ctx.accounts.delegate,
            ctx.accounts.token_program.clone(),
            signer_seeds,
        )
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct CreateUserPDA<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK
    #[account()]
    pub owner: AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_SIZE + UserVault::INIT_SPACE,
        seeds = [PDA_VAULT_SEED, owner.key().as_ref()],
        bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseUserVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, owner.key().as_ref()],
        bump = user_vault.bump,
        close = destination,
    )]
    pub user_vault: Account<'info, UserVault>,
    /// CHECK
    #[account(mut)]
    pub destination: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_SIZE + GlobalState::INIT_SPACE,
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK
    #[account()]
    pub admin: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.admin == admin.key() @ CustomError::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK
    #[account()]
    pub new_admin: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOperator<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.admin == admin.key() @ CustomError::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK
    #[account()]
    pub operator: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct UserVault {
    pub owner: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub admin: Pubkey,
    pub bump: u8,
    #[max_len(5)]
    pub operators: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct TransferLamports<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    /// CHECK: safe
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct TransferByOperator<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    /// CHECK: safe
    #[account()]
    pub user: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.operators.iter().any(|&x| x == operator.key()) @ CustomError::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account()]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseTokenAccountByOperator<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    /// CHECK: safe
    #[account()]
    pub user: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        seeds = [PDA_GLOBAL_STATE_SEED],
        bump = global_state.bump,
        constraint = global_state.operators.iter().any(|&x| x == operator.key()) @ CustomError::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub destination: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseTokenAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub destination: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ApproveToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub delegate: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RevokeApproval<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PDA_VAULT_SEED, user.key().as_ref()],
        bump = user_vault.bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK
    #[account()]
    pub delegate: AccountInfo<'info>,
    #[account()]
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum CustomError {
    #[msg("Unauthorized error")]
    Unauthorized
}
