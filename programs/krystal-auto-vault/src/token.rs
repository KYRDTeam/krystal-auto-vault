use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    approve, close_account, revoke, transfer_checked,
    Approve, CloseAccount, Mint, Revoke, TokenAccount, TokenInterface, TransferChecked
};

pub fn transfer<'info>(
    source: &InterfaceAccount<'info, TokenAccount>,
    destination: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        token_program.to_account_info(),
        TransferChecked {
            from: source.to_account_info(),
            mint: mint.to_account_info(),
            to: destination.to_account_info(),
            authority: authority.to_account_info(),
        },
    )
    .with_signer(signer_seeds);

    transfer_checked(cpi_context, amount, mint.decimals)?;
    Ok(())
}

pub fn close_token_account<'info>(
    account: &InterfaceAccount<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_context = CpiContext::new(
        token_program.to_account_info(),
        CloseAccount {
            account: account.to_account_info(),
            destination: destination.to_account_info(),
            authority: authority.to_account_info(),
        },
    )
    .with_signer(signer_seeds);

    close_account(cpi_context)?;
    Ok(())
}

pub fn approve_token<'info>(
    account: &InterfaceAccount<'info, TokenAccount>,
    delegate: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        token_program.to_account_info(),
        Approve {
            to: account.to_account_info(),
            delegate: delegate.clone(),
            authority: authority.to_account_info(),
        },
    )
    .with_signer(signer_seeds);

    approve(cpi_context, amount)?;
    Ok(())
}

pub fn revoke_approval<'info>(
    account: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    token_program: Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_context = CpiContext::new(
        token_program.to_account_info(),
        Revoke {
            source: account.to_account_info(),
            authority: authority.to_account_info(),
        },
    )
    .with_signer(signer_seeds);

    revoke(cpi_context)?;
    Ok(())
}
